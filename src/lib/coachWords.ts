/**
 * Como o app se refere ao profissional nas telas da ALUNA.
 *
 * Decisão do coach (pacote 6): nada de "coach" para a aluna — ele é
 * Profissional de Educação Física. Usamos o nome dele (primeiro nome, mais
 * próximo) e, sem nome cadastrado, "seu treinador".
 *
 * Sem artigo antes do nome ("de Rennan", "para Rennan"): o app não sabe o
 * gênero do profissional, e "do/da" erraria para alguém.
 */
export const COACH_FALLBACK = "seu treinador";

type CoachLike = { name?: string | null; known?: boolean } | string | null | undefined;

/** Primeiro nome do profissional, ou null quando o nome não é conhecido. */
export function coachFirstName(c: CoachLike): string | null {
  if (!c) return null;
  const raw = typeof c === "string" ? c : c.known === false ? "" : (c.name ?? "");
  const first = raw.trim().split(/\s+/)[0] ?? "";
  if (!first || /^(seu|sua)$/i.test(first)) return null;
  return first;
}

/** "Rennan" | "Seu treinador" (início de frase). */
export const coachSubject = (c: CoachLike) => coachFirstName(c) ?? "Seu treinador";
/** "de Rennan" | "do seu treinador" */
export const coachOf = (c: CoachLike) => { const n = coachFirstName(c); return n ? `de ${n}` : "do seu treinador"; };
/** "para Rennan" | "para o seu treinador" */
export const coachTo = (c: CoachLike) => { const n = coachFirstName(c); return n ? `para ${n}` : "para o seu treinador"; };
/** "por Rennan" | "pelo seu treinador" */
export const coachBy = (c: CoachLike) => { const n = coachFirstName(c); return n ? `por ${n}` : "pelo seu treinador"; };
/** "com Rennan" | "com o seu treinador" */
export const coachWith = (c: CoachLike) => { const n = coachFirstName(c); return n ? `com ${n}` : "com o seu treinador"; };

/**
 * Avisos de atualização do protocolo já gravados no banco antes do pacote 6
 * terminam com "pelo seu coach". Na tela, mostramos sem esse final.
 */
export function normalizeUpdateLabel(label: string | null | undefined): string {
  return (label ?? "").replace(/\s+pelo seu coach\b/gi, "").replace(/\s+do coach\b/gi, "");
}
