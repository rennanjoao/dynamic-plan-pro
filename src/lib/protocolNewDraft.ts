/**
 * protocolNewDraft.ts — rascunho do PRIMEIRO protocolo de um aluno no banco.
 *
 * Complementa (não substitui) o rascunho local do ProtocolBuilder: o local
 * continua sendo gravado a cada 1s e é a rede de segurança offline; o remoto
 * (tabela protocol_new_drafts) permite continuar em outro aparelho.
 * Na abertura, vale o mais recente dos dois.
 *
 * Tudo é best-effort: se a tabela ainda não existir (migration não aplicada)
 * ou a rede falhar, o comportamento é exatamente o de antes (só local).
 */
import { sb } from "@/integrations/supabase/untyped";

export interface NewProtocolDraft {
  name?: string;
  payload: unknown;
  savedAt?: number;
}

const TABLE = "protocol_new_drafts";

// Se a tabela ainda não existe no banco, para de tentar nesta sessão (evita
// uma requisição com erro a cada autosave).
let remoteUnavailable = false;
type PgErr = { code?: string; message?: string } | null | undefined;
function markIfMissing(error: PgErr) {
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42P01" ||
      /could not find the table|relation .* does not exist/i.test(error.message ?? "")) {
    remoteUnavailable = true;
  }
}
/** Só para testes. */
export function __resetRemoteAvailability() { remoteUnavailable = false; }

export async function fetchRemoteNewDraft(coachId: string, studentId: string): Promise<NewProtocolDraft | null> {
  if (remoteUnavailable) return null;
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("name, payload, updated_at")
      .eq("coach_id", coachId)
      .eq("student_id", studentId)
      .maybeSingle();
    markIfMissing(error);
    if (error || !data?.payload) return null;
    const savedAt = data.updated_at ? new Date(data.updated_at).getTime() : undefined;
    return { name: data.name ?? undefined, payload: data.payload, savedAt: Number.isNaN(savedAt) ? undefined : savedAt };
  } catch {
    return null;
  }
}

export async function saveRemoteNewDraft(
  coachId: string,
  studentId: string,
  draft: { name?: string; payload: unknown },
): Promise<boolean> {
  if (remoteUnavailable) return false;
  try {
    const { error } = await sb
      .from(TABLE)
      .upsert(
        { coach_id: coachId, student_id: studentId, name: draft.name ?? null, payload: draft.payload },
        { onConflict: "coach_id,student_id" },
      );
    markIfMissing(error);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteRemoteNewDraft(coachId: string, studentId: string): Promise<void> {
  if (remoteUnavailable) return;
  try {
    await sb.from(TABLE).delete().eq("coach_id", coachId).eq("student_id", studentId);
  } catch { /* best-effort */ }
}

/** Escolhe o rascunho mais recente; sem data conhecida, o local tem preferência. */
export function pickNewestDraft(
  local: NewProtocolDraft | null,
  remote: NewProtocolDraft | null,
): NewProtocolDraft | null {
  const l = local?.payload ? local : null;
  const r = remote?.payload ? remote : null;
  if (!l) return r;
  if (!r) return l;
  if (typeof r.savedAt === "number" && (typeof l.savedAt !== "number" || r.savedAt > l.savedAt)) return r;
  return l;
}

/** Espera uma promessa por no máximo `ms`; depois disso segue com `fallback`. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
