// Marca comissões como pagas (PIX externo já feito).
// Aceita periodId (fechamento inteiro) ou uma lista de commissionIds.
// Comissão já paga é read-only: nunca é reescrita.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const periodId: string | null = body?.periodId ?? null;
    const commissionIds: string[] = Array.isArray(body?.commissionIds) ? body.commissionIds : [];
    if (!periodId && commissionIds.length === 0) return json({ error: "dados inválidos" }, 400, cors);

    const admin = adminClient();
    const callerIsAdmin = await isAdmin(admin, caller.id);
    const nowISO = new Date().toISOString();

    let query = admin
      .from("partner_commissions")
      .update({ status: "paid", paid_at: nowISO })
      .eq("eligible", true)
      .eq("status", "available");

    if (periodId) {
      const { data: period } = await admin
        .from("commission_periods")
        .select("id, coach_id")
        .eq("id", periodId)
        .maybeSingle();
      if (!period) return json({ error: "fechamento não encontrado" }, 404, cors);
      if (!callerIsAdmin && period.coach_id !== caller.id) return json({ error: "não autorizado" }, 403, cors);
      query = query.eq("period_id", periodId);
      if (!callerIsAdmin) query = query.eq("coach_id", caller.id);
    } else {
      query = query.in("id", commissionIds);
      // Coach só paga o que é dele — filtro no backend, não no client.
      if (!callerIsAdmin) query = query.eq("coach_id", caller.id);
    }

    const { data: updated, error } = await query.select("id, commission_amount_cents");
    if (error) {
      console.warn("[mark-commission-paid]", error.message);
      return json({ error: "falha ao marcar como pago" }, 500, cors);
    }

    if (periodId) {
      await admin
        .from("commission_periods")
        .update({ paid_at: nowISO, paid_by: caller.id })
        .eq("id", periodId)
        .is("paid_at", null);
    }

    return json({ ok: true, paid: updated?.length ?? 0 }, 200, cors);
  } catch (e) {
    console.warn("[mark-commission-paid]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
