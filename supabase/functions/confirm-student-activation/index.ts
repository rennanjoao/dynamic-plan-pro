// LEGADO — mantido só para versões antigas do app ainda abertas no navegador.
//
// O app novo registra o pagamento manual pela função do banco
// `coach_settle_charge` (mesma regra dos pagamentos online: ativa o plano,
// avança o vencimento e gera a comissão da parceira na 1ª ativação).
//
// Versões antigas marcavam a cobrança como paga direto na tabela e depois
// chamavam esta função. Aqui só aplicamos, pela regra nova, as cobranças pagas
// desse aluno que ainda não foram aplicadas. Idempotente.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const studentId: string = body?.studentId ?? "";
    if (!studentId) return json({ error: "dados inválidos" }, 400, cors);

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

    const { data: pending } = await admin
      .from("coach_finances")
      .select("id")
      .eq("student_id", studentId)
      .eq("coach_id", link.coach_id)
      .eq("status", "paid")
      .is("applied_at", null);

    let commissionCreated = false;
    for (const row of pending ?? []) {
      const { data } = await admin.rpc("apply_paid_charge", { p_finance_id: row.id });
      if ((data as { commission_created?: boolean } | null)?.commission_created) commissionCreated = true;
    }

    return json({ ok: true, commissionCreated }, 200, cors);
  } catch (e) {
    console.warn("[confirm-student-activation]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
