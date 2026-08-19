// Cria um link de checkout InfinityPay para uma cobrança de coach_finances.
// A API pública usa apenas o handle do coach — nenhuma chave secreta.
// A chamada roda no servidor para manter order_nsu e webhook_url controlados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { coach_id, finance_id, action } = await req.json();
    if (!coach_id || !finance_id) {
      return new Response(JSON.stringify({ error: "coach_id e finance_id são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Só o próprio coach pode gerar link ou consultar pagamento das cobranças dele —
    // sem isso, qualquer usuário autenticado poderia passar o coach_id de outra pessoa.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user || authData.user.id !== coach_id) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles").select("infinitepay_handle").eq("user_id", coach_id).maybeSingle();
    const handle = (profile?.infinitepay_handle || "").trim().replace(/^\$/, "");
    if (!handle) {
      return new Response(JSON.stringify({ error: "Coach sem handle InfinityPay configurado" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: finance } = await admin
      .from("coach_finances")
      .select("id, coach_id, student_id, description, amount, amount_cents, status, plan_slug, plan_cycle_months")
      .eq("id", finance_id).eq("coach_id", coach_id).maybeSingle();
    if (!finance) {
      return new Response(JSON.stringify({ error: "Cobrança não encontrada" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Reconciliação manual ("Verificar pagamento") — fallback caso o webhook falhe.
    if (action === "check") {
      const check = await fetch(
        `https://api.infinitepay.io/invoices/public/checkout/payment_check/${handle}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ external_order_nsu: finance.id }),
        },
      );
      const checkJson = await check.json().catch(() => ({}));
      const paid = check.ok && (checkJson?.paid === true || checkJson?.success === true);
      if (paid && finance.status !== "paid") {
        // Reconciliação: só marca pago com evidência do gateway (nunca por retorno de página).
        await admin.from("coach_finances").update({
          status: "paid",
          payment_method: checkJson?.capture_method === "credit_card" ? "cartao" : "pix_infinitepay",
          paid_at: new Date().toISOString(),
          source: "gateway",
          provider: "infinitepay",
          external_id: checkJson?.transaction_nsu ?? null,
          receipt_url: checkJson?.receipt_url ?? null,
          card_installments: checkJson?.capture_method === "credit_card"
            ? (Number(checkJson?.installments) || null)
            : null,
        }).eq("id", finance.id).neq("status", "paid");
      }
      return new Response(JSON.stringify({ paid: !!paid }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Token de assinatura do webhook: a InfinityPay reenvia esta URL no callback,
    // então validamos essa query string antes de confiar em qualquer payload recebido.
    const webhookSecret = Deno.env.get("INFINITEPAY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Webhook não configurado (INFINITEPAY_WEBHOOK_SECRET ausente)" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const webhookUrl = new URL(`${SUPABASE_URL}/functions/v1/infinitepay-webhook`);
    webhookUrl.searchParams.set("token", webhookSecret);

    const payload = {
      handle,
      order_nsu: finance.id,
      redirect_url: "https://app.eliteprimehub.com.br/student-area",
      webhook_url: webhookUrl.toString(),
      items: [{
        quantity: 1,
        // Valor sempre derivado da cobrança interna (nunca do front-end).
        price: finance.amount_cents ?? Math.round(Number(finance.amount) * 100),
        description: finance.description || "Mensalidade",
      }],
    };

    const resp = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.url) {
      // 422 da InfinityPay = handle inexistente/inativo na conta (payload já validado).
      const message = resp.status === 422
        ? `Handle InfinityPay "$${handle}" inválido ou inativo. Confira o handle exato da sua conta InfinityPay no perfil do coach.`
        : (json?.message || `InfinityPay retornou ${resp.status}`);
      return new Response(JSON.stringify({ error: message }), {
        status: resp.status === 422 ? 400 : 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await admin.from("coach_finances")
      .update({
        checkout_url: json.url,
        checkout_created_at: new Date().toISOString(),
        checkout_slug: typeof json.slug === "string" ? json.slug : null,
        provider: "infinitepay",
      })
      .eq("id", finance.id);

    return new Response(JSON.stringify({ url: json.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
