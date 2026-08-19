// Callback da InfinityPay: confirma o pagamento e marca a cobrança como paga.
// Responde 200 rápido — a InfinityPay reenvia em caso de erro.
//
// Garantias:
// - só processa se o token na query string bater com INFINITEPAY_WEBHOOK_SECRET
//   (evita que qualquer terceiro que descubra a URL marque cobranças como pagas);
// - idempotente: webhook reenviado não cria receita nem cobrança duplicada;
// - só confirma se a cobrança existir e ainda não estiver paga;
// - valor recebido é comparado com o valor esperado (tolerância de 1 centavo);
// - preserva transaction_nsu, receipt_url, parcelas e método quando enviados;
// - falhas não apagam informação anterior.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const ok = (cors: Record<string, string>, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Validação do token ANTES de tocar em qualquer dado. Resposta 200 genérica
    // (nunca 401/403) pra não dar pista a quem estiver tentando adivinhar o token.
    const expectedToken = Deno.env.get("INFINITEPAY_WEBHOOK_SECRET");
    const receivedToken = new URL(req.url).searchParams.get("token");
    if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
      console.error("webhook: token inválido ou ausente");
      return ok(cors, { ignored: "unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const orderNsu: string | undefined = body?.order_nsu ?? body?.orderNsu;
    const captureMethod: string | undefined = body?.capture_method ?? body?.captureMethod;
    const transactionNsu: string | undefined = body?.transaction_nsu ?? body?.transactionNsu;
    const receiptUrl: string | undefined = body?.receipt_url ?? body?.receiptUrl;
    const installments: number | undefined = Number(body?.installments) || undefined;
    // paid_amount / amount vêm em centavos na documentação do Checkout.
    const paidAmountCents: number | undefined =
      Number(body?.paid_amount ?? body?.amount) || undefined;

    if (!orderNsu) return ok(cors, { ignored: "sem order_nsu" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: finance } = await admin
      .from("coach_finances")
      .select("id, status, amount, amount_cents, coach_id, student_id, subscription_id, external_id")
      .eq("id", orderNsu)
      .maybeSingle();

    if (!finance) return ok(cors, { ignored: "cobrança não encontrada" });

    // Idempotência: já paga (ou já com esta transação registrada) => no-op.
    if (finance.status === "paid") return ok(cors, { idempotent: true });

    const expectedCents = finance.amount_cents ?? Math.round(Number(finance.amount) * 100);
    if (paidAmountCents !== undefined && Math.abs(paidAmountCents - expectedCents) > 1) {
      console.error("valor divergente", { orderNsu, expectedCents, paidAmountCents });
      return ok(cors, { ignored: "valor divergente" });
    }

    const paidAt = new Date().toISOString();
    const method = captureMethod === "credit_card" ? "cartao" : "pix_infinitepay";

    const { error: upErr } = await admin
      .from("coach_finances")
      .update({
        status: "paid",
        payment_method: method,
        paid_at: paidAt,
        source: "gateway",
        provider: "infinitepay",
        external_id: transactionNsu ?? null,
        receipt_url: receiptUrl ?? null,
        card_installments: captureMethod === "credit_card" ? (installments ?? null) : null,
      })
      .eq("id", finance.id)
      .neq("status", "paid"); // trava final contra corrida/reenvio

    if (upErr) {
      console.error("falha ao confirmar pagamento", upErr);
      return ok(cors, { error: "falha ao atualizar" });
    }

    if (finance.subscription_id) {
      await admin
        .from("student_subscriptions")
        .update({
          status: "active",
          payment_method: method,
          payment_source: "gateway",
          provider: "infinitepay",
          external_transaction_id: transactionNsu ?? null,
        })
        .eq("id", finance.subscription_id);
    }

    return ok(cors, { confirmed: true });
  } catch (e) {
    console.error("webhook error", e);
    return ok(cors, {});
  }
});
