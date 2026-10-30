// src/lib/weekDaysOps.ts
//
// `weekDays` mapeia dia-da-semana → key de um treino (ou "REST", reservado).
// Qualquer fluxo que SUBSTITUI `workouts` por inteiro (aplicar template de
// treino, importar planilha/JSON) precisa descartar os dias que apontam para
// um treino que deixou de existir; senão a semana mostra um treino fantasma.
// O WorkoutsTab já faz isso ao remover um dia manualmente — template e
// importação não faziam.

export function pruneOrphanWeekDays<
  T extends { workouts?: Array<{ key?: string }>; weekDays?: Record<string, string> },
>(payload: T): T {
  const weekDays = payload.weekDays;
  if (!weekDays) return payload;
  const valid = new Set((payload.workouts ?? []).map((d) => d.key).filter((k): k is string => !!k));
  valid.add("REST");
  const entries = Object.entries(weekDays);
  const kept = entries.filter(([, workoutKey]) => valid.has(workoutKey));
  if (kept.length === entries.length) return payload; // nada a limpar: mesma referência
  return { ...payload, weekDays: Object.fromEntries(kept) };
}
