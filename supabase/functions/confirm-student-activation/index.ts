// Confirma a ativação (pagamento externo por PIX) de um aluno indicado.
// - Calcula o preço final NO BACKEND (desconto de plano + desconto de parceria).
// - Grava student_subscriptions.price_cents como fonte de verdade.
// - Cria partner_commissions apenas na PRIMEIRA ativação do aluno; a garantia
//   real é o índice único parcial (student_id) WHERE eligible = true.
// - Idempotente: chamar duas vezes não duplica assinatura nem comissão.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";
import {
  PARTNER_PLAN_PRICING,
  computeCommission,
  computeFinalPrice,
  isPartnerPlanSlug,
} from "../_shared/partnerPricing.ts";

function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const studentId: string = body?.studentId ?? "";
    const planSlug = body?.planSlug;
    const startedOn: string = (body?.startedOn ?? new Date().toISOString()).slice(0, 10);
    const paymentMethod: string | null = body?.paymentMethod ?? "pix";

    if (!studentId || !isPartnerPlanSlug(planSlug)) {
      return json({ error: "dados inválidos" }, 400, cors);
    }

    const admin = adminClient();
    const callerIsAdmin = await isAdmin(admin, caller.id);

    // O coach do recurso nunca vem do client.
    const { data: link } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    if (!link) return json({ error: "aluno sem vínculo ativo" }, 400, cors);
    if (!callerIsAdmin && link.coach_id !== caller.id) {
      return json({ error: "não autorizado" }, 403, cors);
    }
    const coachId: string = link.coach_id;

    const { data: attribution } = await admin
      .from("partner_attributions")
      .select("partner_id, locked")
      .eq("student_id", studentId)
      .maybeSingle();

    let partner: { user_id: string; commission_rate_bp: number; status: string } | null = null;
    if (attribution?.partner_id) {
      const { data } = await admin
        .from("partner_profiles")
        .select("user_id, commission_rate_bp, status")
        .eq("user_id", attribution.partner_id)
        .maybeSingle();
      partner = data ?? null;
    }

    const breakdown = computeFinalPrice(planSlug, !!partner);
    const plan = PARTNER_PLAN_PRICING[planSlug];

    // Assinatura — idempotente por (aluno, plano, data de início)
    const { data: existing } = await admin
      .from("student_subscriptions")
      .select("id, price_cents")
      .eq("student_id", studentId)
      .eq("plan_slug", planSlug)
      .eq("started_on", startedOn)
      .maybeSingle();

    let subscriptionId = existing?.id ?? null;

    if (!subscriptionId) {
      const { data: created, error: subErr } = await admin
        .from("student_subscriptions")
        .insert({
          student_id: studentId,
          coach_id: coachId,
          plan_slug: planSlug,
          plan_name: plan.name,
          price_cents: breakdown.final_price_cents,
          cycle_months: plan.duration_months,
          started_on: startedOn,
          next_due_date: addMonths(startedOn, plan.duration_months),
          status: "active",
          payment_method: paymentMethod,
          payment_source: "manual",
        })
        .select("id")
        .single();

      if (subErr) {
        console.warn("[confirm-student-activation] subscription", subErr.message);
        return json({ error: "falha ao ativar assinatura" }, 500, cors);
      }
      subscriptionId = created.id;
    }

    // Comissão — só na primeira ativação elegível do aluno.
    let commission: Record<string, unknown> | null = null;
    let commissionCreated = false;

    if (partner && partner.status === "active") {
      const { data: already } = await admin
        .from("partner_commissions")
        .select("id, commission_amount_cents, status")
        .eq("student_id", studentId)
        .eq("eligible", true)
        .maybeSingle();

      if (already) {
        commission = already;
      } else {
        const amount = computeCommission(breakdown.final_price_cents, partner.commission_rate_bp);
        const { data: createdCommission, error: comErr } = await admin
          .from("partner_commissions")
          .insert({
            student_id: studentId,
            partner_id: partner.user_id,
            coach_id: coachId,
            subscription_id: subscriptionId,
            gross_amount_cents: breakdown.final_price_cents,
            commission_rate_bp: partner.commission_rate_bp,
            commission_amount_cents: amount,
            eligible: true,
            status: "available",
          })
          .select("id, commission_amount_cents, status")
          .maybeSingle();

        // 23505 = índice único parcial disparou (corrida) — no-op, não é erro.
        if (comErr && comErr.code !== "23505") {
          console.warn("[confirm-student-activation] commission", comErr.message);
        } else if (createdCommission) {
          commission = createdCommission;
          commissionCreated = true;
          await admin
            .from("partner_attributions")
            .update({ locked: true })
            .eq("student_id", studentId);
        }
      }
    }

    return json(
      { ok: true, subscriptionId, breakdown, commission, commissionCreated },
      200,
      cors,
    );
  } catch (e) {
    console.warn("[confirm-student-activation]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
