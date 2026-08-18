// Gera um código de acesso neutro (ex.: ELT-7K4P92).
// Coach só gera para as próprias influenciadoras; admin gera para qualquer uma.
// O coach_id do código é SEMPRE herdado de partner_profiles.coach_id quando há
// partner_id — impede o estado inconsistente "código da parceira X, coach Y".
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I/O/0/1

function newCode(): string {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `ELT-${s}`;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const partnerId: string | null = body?.partnerId ?? null;
    const note: string | null = body?.note ?? null;
    const expiresAt: string | null = body?.expiresAt ?? null;

    const admin = adminClient();
    const callerIsAdmin = await isAdmin(admin, caller.id);

    let coachId: string;

    if (partnerId) {
      const { data: partner } = await admin
        .from("partner_profiles")
        .select("user_id, coach_id, status")
        .eq("user_id", partnerId)
        .maybeSingle();

      if (!partner || partner.status !== "active") {
        return json({ error: "parceria indisponível" }, 400, cors);
      }
      if (!callerIsAdmin && partner.coach_id !== caller.id) {
        return json({ error: "não autorizado" }, 403, cors);
      }
      coachId = partner.coach_id; // herdado, nunca vindo do client
    } else {
      const requested: string | null = body?.coachId ?? null;
      if (callerIsAdmin) {
        if (!requested) return json({ error: "coachId obrigatório" }, 400, cors);
        coachId = requested;
      } else {
        coachId = caller.id;
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { data, error } = await admin
        .from("access_codes")
        .insert({
          code,
          partner_id: partnerId,
          coach_id: coachId,
          status: "unused",
          note,
          expires_at: expiresAt,
          created_by: caller.id,
        })
        .select("id, code, partner_id, coach_id, status, expires_at, created_at")
        .single();

      if (!error && data) return json({ ok: true, accessCode: data }, 200, cors);
      if (error && error.code !== "23505") {
        console.warn("[generate-access-code]", error.message);
        return json({ error: "falha ao gerar código" }, 500, cors);
      }
    }

    return json({ error: "falha ao gerar código" }, 500, cors);
  } catch (e) {
    console.warn("[generate-access-code]", e instanceof Error ? e.message : e);
    return json({ error: "erro interno" }, 500, cors);
  }
});
