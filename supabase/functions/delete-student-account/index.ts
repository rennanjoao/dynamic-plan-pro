// LGPD: exclusão da conta e dos dados de um aluno, pedida pelo próprio aluno,
// pelo coach dele ou pelo admin. Ordem:
//   1) confere quem pede (regras em _shared/studentDeletion.ts);
//   2) apaga os arquivos do aluno no bucket privado (<aluno>/...);
//   3) apaga as linhas do aluno (lgpd_delete_student_rows; mantém financeiro);
//   4) apaga o login (auth.users) — o que sobrou com FK em cascata vai junto.
// Idempotente: se falhar no meio, pode chamar de novo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { decideDeletion } from "../_shared/studentDeletion.ts";

const BUCKET = "student-media";

type Admin = ReturnType<typeof createClient>;

async function listAllFiles(admin: Admin, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Pasta: o storage devolve sem id.
      if (item.id === null) out.push(...await listAllFiles(admin, path, depth + 1));
      else out.push(path);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Não autenticado." }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sessão inválida." }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const targetId = typeof body.studentId === "string" && body.studentId ? body.studentId : callerId;
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "Aluno inválido." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const [callerRoles, targetRoles, links, partner] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", callerId),
      admin.from("user_roles").select("role").eq("user_id", targetId),
      admin.from("coach_students").select("coach_id, status").eq("student_id", targetId),
      admin.from("partner_profiles").select("user_id").eq("user_id", targetId).maybeSingle(),
    ]);
    if (callerRoles.error || targetRoles.error || links.error || partner.error) {
      return json({ error: "Não foi possível verificar a permissão agora. Tente de novo." }, 500);
    }

    const decision = decideDeletion({
      callerId,
      targetId,
      callerRoles: (callerRoles.data ?? []).map((r: { role: string }) => r.role),
      targetRoles: (targetRoles.data ?? []).map((r: { role: string }) => r.role),
      targetCoachLinks: (links.data ?? []) as { coach_id: string; status: string | null }[],
      targetIsPartner: !!partner.data,
      confirm: body.confirm,
    });
    if (!decision.ok) return json({ error: decision.error }, decision.status);

    // 2) arquivos (antes das linhas: se algo falhar depois, o vínculo ainda existe e dá para repetir)
    let filesDeleted = 0;
    let filesFailed = false;
    try {
      const files = await listAllFiles(admin, targetId);
      for (let i = 0; i < files.length; i += 100) {
        const chunk = files.slice(i, i + 100);
        const { error } = await admin.storage.from(BUCKET).remove(chunk);
        if (error) { filesFailed = true; console.error("[delete-student-account] arquivos:", error.message); }
        else filesDeleted += chunk.length;
      }
    } catch (e) {
      filesFailed = true;
      console.error("[delete-student-account] listar arquivos:", e instanceof Error ? e.message : e);
    }

    // 3) linhas no banco (uma transação só: ou apaga tudo, ou nada)
    const { data: deletedRows, error: rowsErr } = await admin.rpc("lgpd_delete_student_rows", { p_student: targetId });
    if (rowsErr) {
      console.error("[delete-student-account] linhas:", rowsErr.message);
      return json({ error: "Não foi possível apagar os dados agora. Tente de novo." }, 500);
    }

    // 4) login
    const { error: authErr } = await admin.auth.admin.deleteUser(targetId);
    const authMissing = !!authErr && /not.?found/i.test(authErr.message);
    if (authErr && !authMissing) {
      console.error("[delete-student-account] auth:", authErr.message);
      return json({ error: "Os dados foram apagados, mas o login não. Avise o suporte para concluir." }, 500);
    }

    // Auditoria sem dados pessoais (só ids e contagens).
    try {
      await admin.from("admin_audit_log").insert({
        actor_id: callerId,
        action: "lgpd-delete-student",
        target_user_id: targetId,
        details: { actor: decision.actor, rows: deletedRows ?? {}, files: filesDeleted, files_failed: filesFailed },
      });
    } catch (e) {
      console.warn("[delete-student-account] auditoria falhou:", e instanceof Error ? e.message : e);
    }

    return json({ ok: true, actor: decision.actor, files: filesDeleted, filesFailed });
  } catch (e) {
    console.error("[delete-student-account]", e instanceof Error ? e.message : e);
    return json({ error: "Erro inesperado. Tente de novo." }, 500);
  }
});
