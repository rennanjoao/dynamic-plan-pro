// Consome um código de acesso durante o cadastro do aluno indicado.
// - Resolve o código via RPC SECURITY DEFINER (service_role) — o client nunca
//   consegue varrer códigos válidos.
// - Vincula aluno ↔ coach e cria a atribuição de parceria (se houver parceira).
// - Erros sempre genéricos: nunca revelam se o código existe ou a quem pertence.
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, json } from "../_shared/partnerAuth.ts";

const GENERIC = { error: "código inválido" };

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return json(GENERIC, 400, cors);

    const admin = adminClient();
    const { data: rows, error: resolveErr } = await admin.rpc("resolve_access_code", { p_code: code });
    if (resolveErr) {
      console.warn("[redeem-access-code] resolve", resolveErr.message);
      return json({ error: "erro interno" }, 500, cors);
    }

    const found = Array.isArray(rows) ? rows[0] : rows;
    if (!found) return json(GENERIC, 400, cors);
    if (found.status !== "unused" && found.status !== "assigned") return json(GENERIC, 400, cors);
    if (found.expires_at && new Date(found.expires_at).getTime() < Date.now()) {
      return json(GENERIC, 400, cors);
    }
    if (found.partner_id && found.partner_id === caller.id) return json(GENERIC, 400, cors);

    // Consumo atômico: só vence quem trocar o status a partir de não-usado.
    const { data: claimed, error: claimErr } = await admin
      .from("access_codes")
      .update({ status: "activated", student_id: caller.id, used_at: new Date().toISOString() })
      .eq("id", found.id)
      .in("status", ["unused", "assigned"])
      .select("id, code, partner_id, coach_id, kind, partner_commission_bp")
      .maybeSingle();

    if (claimErr) {
      console.warn("[redeem-access-code] claim", claimErr.message);
      return json({ error: "erro interno" }, 500, cors);
    }
    if (!claimed) return json(GENERIC, 400, cors);

    // Vínculo aluno ↔ coach (idempotente)
    const { data: link } = await admin
      .from("coach_students")
      .select("id")
      .eq("coach_id", claimed.coach_id)
      .eq("student_id", caller.id)
      .maybeSingle();

    if (!link) {
      await admin.from("coach_students").insert({
        coach_id: claimed.coach_id,
        student_id: caller.id,
        status: "active",
      });
    }

    // Atribuição de parceria — um aluno tem no máximo uma origem, para sempre.
    let attributed = false;
    let becamePartner = false;

    if (claimed.kind === "partner") {
      // Código de convite de parceria: a pessoa vira influenciadora ativa na hora.
      const rawBp = Number(claimed.partner_commission_bp ?? 1000);
      const commissionRateBp =
        Number.isInteger(rawBp) && rawBp >= 0 && rawBp <= 10000 ? rawBp : 1000;

      const { error: partnerErr } = await admin.from("partner_profiles").upsert(
        {
          user_id: caller.id,
          coach_id: claimed.coach_id,
          status: "active",
          commission_rate_bp: commissionRateBp,
          deactivated_at: null,
        },
        { onConflict: "user_id" },
      );
      if (partnerErr) console.warn("[redeem-access-code] partner", partnerErr.message);
      else becamePartner = true;
    } else if (claimed.partner_id) {
      const { error: attrErr } = await admin.from("partner_attributions").upsert(
        {
          student_id: caller.id,
          partner_id: claimed.partner_id,
          coach_id: claimed.coach_id,
          access_code: claimed.code,
          attributed_by: caller.id,
        },
        { onConflict: "student_id", ignoreDuplicates: true },
      );
      if (attrErr) console.warn("[redeem-access-code] attribution", attrErr.message);
      else attributed = true;
    }

    return json({ ok: true, coachId: claimed.coach_id, attributed, becamePartner }, 200, cors);
  } catch (e) {
    console.warn("[redeem-access-code]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
