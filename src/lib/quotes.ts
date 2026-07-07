// src/lib/quotes.ts
// Mensagens motivacionais dinâmicas para o card de compartilhamento de
// treino (WorkoutShareCard). Foco em consistência, adesão e disciplina —
// nunca hype vazio. Duas categorias: recorde pessoal batido na sessão
// (PR_QUOTES) e treino "comum" concluído (CONSISTENCY_QUOTES).

/** Exibidas quando o aluno bateu 1+ recorde pessoal na sessão. */
export const PR_QUOTES: readonly string[] = [
  "Você superou seus próprios limites.",
  "Recorde batido. A disciplina está compondo juros.",
  "Isso não foi sorte — foi consistência acumulada.",
  "Prova de que o método está funcionando.",
  "Cada recorde é resultado de um hábito, não de um dia.",
  "Você não teve um treino bom. Você teve um processo bom.",
];

/** Exibidas em treinos concluídos sem recorde — o caso mais comum. */
export const CONSISTENCY_QUOTES: readonly string[] = [
  "Consistência é o único atalho.",
  "Disciplina é fazer mesmo nos dias sem vontade.",
  "Resultado é a soma de decisões chatas repetidas.",
  "Você apareceu. Isso já separa quem evolui de quem estaciona.",
  "Adesão ao plano é o verdadeiro divisor de águas.",
  "Ninguém vê o treino de hoje. Todo mundo vê o resultado em 90 dias.",
  "Motivação some. Disciplina fica.",
  "Mais um tijolo na parede — sem pular etapa.",
];

/**
 * Retorna uma frase motivacional aleatória para o card de compartilhamento.
 * @param hasPR se o aluno bateu recorde(s) pessoal(is) nesta sessão
 */
export function getRandomWorkoutQuote(hasPR: boolean): string {
  const pool = hasPR ? PR_QUOTES : CONSISTENCY_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}