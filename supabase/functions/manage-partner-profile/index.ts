// Ativa/edita/desativa uma aluna como parceira (influenciadora).
// Exclusivo do ADMIN: o coach nunca define a própria taxa de comissão.
// O coach_id é DERIVADO do vínculo existente em coach_students — nunca escolhido.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";

const PIX_TYPES = ["cpf", "cnpj", "email", "phone", "random"];
const STATUSES = ["active", "inactive", "suspended"];

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const admin = adminClient();
    if (!(await isAdmin(admin, caller.id))) return json({ error: "não autorizado" }, 403, cors);

    const body = await req.json().catch(() => ({}));
    const userId: string = body?.userId ?? "";
    if (!userId) return json({ error: "dados inválidos" }, 400, cors);

    const status: string = STATUSES.includes(body?.status) ? body.status : "active";
    const rateBp = Number(body?.commissionRateBp ?? 1000);
    if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10000) {
      return json({ error: "taxa de comissão inválida" }, 400, cors);
    }
    const pixType = PIX_TYPES.includes(body?.pixType) ? body.pixType : null;

    const { data: existing } = await admin
      .from("partner_profiles")
      .select("user_id, coach_id")
      .eq("user_id", userId)
      .maybeSingle();

    let coachId = existing?.coach_id ?? null;
    if (!coachId) {
      const { data: derived } = await admin.rpc("derive_partner_coach", { p_partner_id: userId });
      coachId = typeof derived === "string" ? derived : null;
      if (!coachId) return json({ error: "aluna sem coach ativo vinculado" }, 400, cors);
    }

    const payload = {
      user_id: userId,
      coach_id: coachId,
      status,
      commission_rate_bp: rateBp,
      pix_type: pixType,
      pix_key: body?.pixKey ?? null,
      pix_holder_name: body?.pixHolderName ?? null,
      activated_by_admin: caller.id,
      deactivated_at: status === "active" ? null : new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("partner_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      console.warn("[manage-partner-profile]", error.message);
      return json({ error: "falha ao salvar parceria" }, 500, cors);
    }

    return json({ ok: true, partner: data }, 200, cors);
  } catch (e) {
    console.warn("[manage-partner-profile]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
