/**
 * coachAccessStatus.ts — o coach do aluno está bloqueado na plataforma?
 *
 * Fonte oficial: RPC `get_my_coach_access_status` (vínculo ATIVO em
 * coach_students + blocked_until do coach). Antes a tela usava coach_plans
 * (cópia legada) e liberava o aluno em qualquer erro.
 *
 * Regras em caso de falha:
 *  - RPC ainda não existe no banco (migration não aplicada) → consulta direta
 *    equivalente (coach_students ativo → profiles.blocked_until).
 *  - Erro de rede/servidor → usa o ÚLTIMO status conhecido deste aparelho.
 *    Não bloqueia por padrão de propósito: a aluna pode estar na academia sem
 *    sinal, com o treino salvo offline, e não pode ser travada por isso.
 *    Quem já foi visto como bloqueado continua bloqueado.
 */
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = (uid: string) => `coach_access_status_${uid}`;

type PgError = { code?: string; message?: string } | null | undefined;

/** Erro de "função não encontrada" (PostgREST/Postgres). */
export function isMissingFunctionError(err: PgError): boolean {
  if (!err) return false;
  return err.code === "PGRST202" || err.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(err.message ?? "");
}

export function isBlockedUntilActive(blockedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!blockedUntil) return false;
  const d = new Date(blockedUntil);
  return !Number.isNaN(d.getTime()) && d > now;
}

export function readCachedCoachBlocked(uid: string): boolean | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(uid));
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch { /* localStorage indisponível */ }
  return null;
}

function writeCachedCoachBlocked(uid: string, blocked: boolean) {
  try { localStorage.setItem(CACHE_KEY(uid), blocked ? "1" : "0"); } catch { /* noop */ }
}

/** Decide o status final quando a verificação online falhou. */
export function blockedFromCache(cached: boolean | null): boolean {
  return cached === true;
}

async function fetchViaFallback(uid: string): Promise<boolean> {
  const { data: link, error: linkErr } = await supabase
    .from("coach_students")
    .select("coach_id, updated_at")
    .eq("student_id", uid)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!link?.coach_id) return false;
  const { data: coach, error: coachErr } = await supabase
    .from("profiles")
    .select("blocked_until")
    .eq("user_id", link.coach_id)
    .maybeSingle();
  if (coachErr) throw coachErr;
  return isBlockedUntilActive(coach?.blocked_until ?? null);
}

/**
 * Retorna true quando o aluno deve ver "Plataforma temporariamente indisponível".
 * Nunca lança erro.
 */
export async function fetchCoachBlocked(uid: string): Promise<boolean> {
  try {
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: PgError }>;
    }).rpc("get_my_coach_access_status");

    let blocked: boolean;
    if (error) {
      if (!isMissingFunctionError(error)) throw error;
      blocked = await fetchViaFallback(uid);
    } else {
      const row = Array.isArray(data) ? (data[0] as { coach_blocked?: boolean } | undefined) : undefined;
      blocked = !!row?.coach_blocked;
    }
    writeCachedCoachBlocked(uid, blocked);
    return blocked;
  } catch {
    return blockedFromCache(readCachedCoachBlocked(uid));
  }
}
