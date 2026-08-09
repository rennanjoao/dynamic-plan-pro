// Cria um link de checkout InfinityPay para uma cobrança de coach_finances.
// A API pública usa apenas o handle do coach — nenhuma chave secreta.
// A chamada roda no servidor para manter order_nsu e webhook_url controlados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { coach_id, finance_id } = await req.json();
    if (!coach_id || !finance_id) {
      return new Response(JSON.stringify({ error: "coach_id e finance_id são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
      .select("id, coach_id, description, amount, status")
      .eq("id", finance_id).eq("coach_id", coach_id).maybeSingle();
    if (!finance) {
      return new Response(JSON.stringify({ error: "Cobrança não encontrada" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const payload = {
      handle,
      order_nsu: finance.id,
      redirect_url: "https://app.eliteprimehub.com.br/student-area",
      webhook_url: `${SUPABASE_URL}/functions/v1/infinitepay-webhook`,
      items: [{
        quantity: 1,
        price: Math.round(Number(finance.amount) * 100),
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
      return new Response(JSON.stringify({ error: json?.message || `InfinityPay retornou ${resp.status}` }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await admin.from("coach_finances")
      .update({ checkout_url: json.url, checkout_created_at: new Date().toISOString() })
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
