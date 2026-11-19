/**
 * Pendências DO COACH (o que falta ele responder), separadas do atraso do
 * aluno. O selo "Em dia/Atenção/Crítico" mede só se o aluno enviou o
 * check-in; um aluno que mandou ontem e ainda não teve retorno aparecia
 * "Em dia". Aqui a regra é:
 *
 *   - Um aluno está "aguardando resposta" quando o check-in MAIS RECENTE dele
 *     não tem feedback do coach.
 *   - Os check-ins pendentes são os enviados depois do último que teve
 *     feedback (check-ins muito antigos, de antes do coach usar o painel, não
 *     voltam a cobrar resposta).
 */

export interface CheckinFeedbackLite {
  id?: string;
  student_id?: string;
  submitted_at: string;
  coach_feedback: string | null;
}

export function hasCoachFeedback(fb: string | null | undefined): boolean {
  return typeof fb === "string" && fb.trim().length > 0;
}

/** Check-ins sem resposta, do mais antigo ao mais novo, enviados depois do último respondido. */
export function unansweredSinceLastReply<T extends CheckinFeedbackLite>(rows: T[]): T[] {
  const desc = [...rows].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );
  const pending: T[] = [];
  for (const r of desc) {
    if (hasCoachFeedback(r.coach_feedback)) break;
    pending.push(r);
  }
  return pending.reverse();
}

export interface AwaitingReply {
  /** Quantos check-ins seguidos estão sem resposta. */
  count: number;
  /** Data de envio do mais antigo ainda sem resposta (desde quando o aluno espera). */
  since: string;
}

/** Agrupa por aluno e devolve só quem está aguardando resposta. */
export function awaitingReplyByStudent(rows: CheckinFeedbackLite[]): Map<string, AwaitingReply> {
  const byStudent = new Map<string, CheckinFeedbackLite[]>();
  for (const r of rows) {
    if (!r.student_id) continue;
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }
  const out = new Map<string, AwaitingReply>();
  for (const [sid, list] of byStudent) {
    const pending = unansweredSinceLastReply(list);
    if (pending.length > 0) out.set(sid, { count: pending.length, since: pending[0].submitted_at });
  }
  return out;
}

/**
 * Qual check-in o painel de feedback deve abrir: o mais antigo ainda sem
 * resposta; se tudo estiver respondido, o mais recente.
 */
export function pickCheckinToOpen<T extends CheckinFeedbackLite>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const pending = unansweredSinceLastReply(rows);
  if (pending.length > 0) return pending[0];
  return [...rows].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  )[0];
}

/** "há 3 dias", "hoje", "ontem" — tempo de espera curto e legível. */
export function waitingLabel(sinceIso: string, now: Date = new Date()): string {
  const start = new Date(sinceIso);
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.max(0, Math.round((b - a) / 86_400_000));
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}
