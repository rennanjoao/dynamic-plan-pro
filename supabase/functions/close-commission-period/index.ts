// Fechamento quinzenal das comissões de uma influenciadora.
// Idempotente: reexecutar o mesmo período não duplica o fechamento nem
// reinclui comissões já fechadas/pagas.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const partnerId: string = body?.partnerId ?? "";
    const periodStart: string = (body?.periodStart ?? "").slice(0, 10);
    const periodEnd: string = (body?.periodEnd ?? "").slice(0, 10);
    if (!partnerId || !periodStart || !periodEnd) return json({ error: "dados inválidos" }, 400, cors);

    const admin = adminClient();
    const callerIsAdmin = await isAdmin(admin, caller.id);

    const { data: partner } = await admin
      .from("partner_profiles")
      .select("user_id, coach_id")
      .eq("user_id", partnerId)
      .maybeSingle();
    if (!partner) return json({ error: "parceria não encontrada" }, 404, cors);
    if (!callerIsAdmin && partner.coach_id !== caller.id) return json({ error: "não autorizado" }, 403, cors);

    const coachId = partner.coach_id;

    // Fechamento existente (idempotência)
    const { data: existingPeriod } = await admin
      .from("commission_periods")
      .select("id, paid_at, total_amount_cents")
      .eq("coach_id", coachId)
      .eq("partner_id", partnerId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    let periodId = existingPeriod?.id ?? null;
    if (existingPeriod?.paid_at) {
      return json({ ok: true, periodId, alreadyPaid: true, total_amount_cents: existingPeriod.total_amount_cents }, 200, cors);
    }

    if (!periodId) {
      const { data: created, error: perErr } = await admin
        .from("commission_periods")
        .insert({
          coach_id: coachId,
          partner_id: partnerId,
          period_start: periodStart,
          period_end: periodEnd,
          total_amount_cents: 0,
        })
        .select("id")
        .single();
      if (perErr) {
        console.warn("[close-commission-period] period", perErr.message);
        return json({ error: "falha ao fechar período" }, 500, cors);
      }
      periodId = created.id;
    }

    // Só comissões elegíveis, disponíveis e ainda sem fechamento entram.
    const { data: attached, error: attachErr } = await admin
      .from("partner_commissions")
      .update({ period_id: periodId })
      .eq("coach_id", coachId)
      .eq("partner_id", partnerId)
      .eq("eligible", true)
      .eq("status", "available")
      .is("period_id", null)
      .gte("created_at", `${periodStart}T00:00:00Z`)
      .lte("created_at", `${periodEnd}T23:59:59Z`)
      .select("id, commission_amount_cents");

    if (attachErr) {
      console.warn("[close-commission-period] attach", attachErr.message);
      return json({ error: "falha ao fechar período" }, 500, cors);
    }

    const { data: allInPeriod } = await admin
      .from("partner_commissions")
      .select("commission_amount_cents")
      .eq("period_id", periodId)
      .eq("eligible", true);

    const total = (allInPeriod ?? []).reduce(
      (sum, c) => sum + (c.commission_amount_cents ?? 0),
      0,
    );

    await admin.from("commission_periods").update({ total_amount_cents: total }).eq("id", periodId);

    return json({ ok: true, periodId, added: attached?.length ?? 0, total_amount_cents: total }, 200, cors);
  } catch (e) {
    console.warn("[close-commission-period]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
