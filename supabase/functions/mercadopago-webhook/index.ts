/**
 * mercadopago-webhook
 *
 * Única fonte de verdade para liberar/renovar plano.
 *
 * Validações obrigatórias, nesta ordem:
 * 1. assinatura HMAC (`x-signature` + `x-request-id`) com MERCADO_PAGO_WEBHOOK_SECRET;
 * 2. o pagamento é consultado na API oficial (nunca confiamos no corpo recebido);
 * 3. `external_reference` precisa apontar para uma cobrança existente;
 * 4. o valor pago é comparado com o valor esperado no banco;
 * 5. só `approved` marca como pago;
 * 6. idempotência: índice único em mercado_pago_payment_id + guarda `neq status paid`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  addMonths,
  amountsMatch,
  mapPaymentMethod,
  mapPaymentStatus,
  toCentsFromAmount,
  verifyWebhookSignature,
} from "../_shared/mercadopago.ts";

const MP_API = "https://api.mercadopago.com";

// Responde sempre 200 para o Mercado Pago não ficar reenviando indefinidamente,
// e sem revelar detalhes a quem tentar adivinhar a URL.
const ok = (cors: Record<string, string>, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const dataId =
      (body as any)?.data?.id?.toString() ??
      url.searchParams.get("data.id") ??
      (body as any)?.id?.toString() ??
      null;
    const type = (body as any)?.type ?? (body as any)?.topic ?? url.searchParams.get("type");

    const valid = await verifyWebhookSignature({
      signatureHeader: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
      dataId,
      secret: Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET"),
    });
    if (!valid) {
      console.error("mp-webhook: assinatura inválida");
      return ok(cors, { ignored: "unauthorized" });
    }

    if (type && type !== "payment") return ok(cors, { ignored: `tipo ${type}` });
    if (!dataId) return ok(cors, { ignored: "sem data.id" });

    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) {
      console.error("mp-webhook: access token ausente");
      return ok(cors, { ignored: "sem credencial" });
    }

    // 2. Consulta o pagamento real na API do Mercado Pago.
    const resp = await fetch(`${MP_API}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.error("mp-webhook: falha ao consultar pagamento", resp.status);
      return ok(cors, { ignored: "pagamento não consultável" });
    }
    const payment = await resp.json().catch(() => ({} as Record<string, unknown>));

    const externalReference: string | null = (payment as any)?.external_reference ?? null;
    if (!externalReference) return ok(cors, { ignored: "sem external_reference" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: finance } = await admin
      .from("coach_finances")
      .select(
        "id, status, amount, amount_cents, coach_id, student_id, subscription_id, plan_slug, plan_cycle_months, plan_name_snapshot, mercado_pago_payment_id",
      )
      .eq("id", externalReference)
      .maybeSingle();
    if (!finance) return ok(cors, { ignored: "cobrança não encontrada" });

    const paymentId = String((payment as any)?.id ?? dataId);
    const internalStatus = mapPaymentStatus((payment as any)?.status);

    // 6. Idempotência.
    if (finance.status === "paid" || finance.mercado_pago_payment_id === paymentId) {
      return ok(cors, { idempotent: true });
    }

    // 4. Valor pago vs. valor esperado.
    const expectedCents = finance.amount_cents ?? Math.round(Number(finance.amount) * 100);
    const paidCents = toCentsFromAmount(
      (payment as any)?.transaction_details?.total_paid_amount ??
        (payment as any)?.transaction_amount,
    );
    if (internalStatus === "paid" && !amountsMatch(paidCents, expectedCents)) {
      console.error("mp-webhook: valor divergente", { financeId: finance.id, expectedCents, paidCents });
      await admin
        .from("coach_finances")
        .update({ mercado_pago_status: "amount_mismatch", mercado_pago_payment_id: paymentId })
        .eq("id", finance.id);
      return ok(cors, { ignored: "valor divergente" });
    }

    // 5. Só approved libera.
    if (internalStatus !== "paid") {
      await admin
        .from("coach_finances")
        .update({
          mercado_pago_status: (payment as any)?.status ?? internalStatus,
          mercado_pago_payment_id: paymentId,
          provider: "mercadopago",
        })
        .eq("id", finance.id)
        .neq("status", "paid");
      return ok(cors, { status: internalStatus });
    }

    const method = mapPaymentMethod((payment as any)?.payment_type_id);
    const paidAt = (payment as any)?.date_approved ?? new Date().toISOString();

    const { error: upErr } = await admin
      .from("coach_finances")
      .update({
        status: "paid",
        payment_method: method,
        paid_at: paidAt,
        source: "gateway",
        provider: "mercadopago",
        external_id: paymentId,
        mercado_pago_payment_id: paymentId,
        mercado_pago_status: "approved",
        receipt_url: (payment as any)?.transaction_details?.external_resource_url ?? null,
        card_installments: Number((payment as any)?.installments) || null,
      })
      .eq("id", finance.id)
      .neq("status", "paid");

    if (upErr) {
      // Índice único no payment_id: corrida/reenvio simultâneo => já processado.
      console.error("mp-webhook: falha ao confirmar", upErr.message);
      return ok(cors, { idempotent: true });
    }

    // Assinatura só é atualizada AGORA (troca/renovação/primeira contratação).
    if (finance.subscription_id) {
      const { data: sub } = await admin
        .from("student_subscriptions")
        .select("id, plan_slug, cycle_months, next_due_date")
        .eq("id", finance.subscription_id)
        .maybeSingle();

      const cycle = finance.plan_cycle_months ?? sub?.cycle_months ?? 1;
      const today = new Date().toISOString().slice(0, 10);
      const base =
        sub?.next_due_date && sub.next_due_date > today && finance.plan_slug === sub.plan_slug
          ? sub.next_due_date
          : today;

      await admin
        .from("student_subscriptions")
        .update({
          plan_slug: finance.plan_slug ?? sub?.plan_slug,
          plan_name: finance.plan_name_snapshot ?? undefined,
          price_cents: expectedCents,
          cycle_months: cycle,
          status: "active",
          next_due_date: addMonths(base, cycle),
          payment_method: method,
          payment_source: "gateway",
          provider: "mercadopago",
          external_transaction_id: paymentId,
        })
        .eq("id", finance.subscription_id);
    }

    return ok(cors, { confirmed: true });
  } catch (e) {
    console.error("mp-webhook error", e instanceof Error ? e.message : e);
    return ok(cors, {});
  }
});
