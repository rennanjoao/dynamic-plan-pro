/**
 * Vínculo do aeróbico (aba Treinos do protocolo): a um treino, a um dia da
 * semana (inclusive descanso) ou a nada (geral). Mesmo formato salvo de
 * sempre: associationType "workout" | "weekday" + workoutKey.
 */
export const DAY_LABEL: Record<string, string> = {
  seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo",
};

type Link = { associationType: "workout" | "weekday"; workoutKey: string };

/** Valor do seletor "Vinculado a". */
export function cardioLinkValue(c: Partial<Link>): string {
  if (!c.workoutKey) return "none";
  return c.associationType === "weekday" ? `d:${c.workoutKey}` : `w:${c.workoutKey}`;
}

export function cardioFromLink(v: string): Link {
  if (v.startsWith("d:")) return { associationType: "weekday", workoutKey: v.slice(2) };
  if (v.startsWith("w:")) return { associationType: "workout", workoutKey: v.slice(2) };
  return { associationType: "workout", workoutKey: "" };
}
