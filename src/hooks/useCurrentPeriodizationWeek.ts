/**
 * Semana ATUAL do ciclo de periodização — em LOOP, pelo CALENDÁRIO.
 *
 * O ciclo tem `totalWeeks` semanas (Semana 1 → 2 → 3 → 4 → volta para a Semana 1 → …),
 * contadas em blocos de 7 dias corridos a partir do DIA em que a aluna abriu o protocolo
 * pela primeira vez (`protocols.student_first_viewed_at`, a mesma data que o radar do coach e
 * o alerta de feedback já usam).
 *
 * A semana NÃO depende de a aluna abrir a tela de treino, usar o Modo Treino ou registrar
 * qualquer série: às vezes ela treina sem iniciar o Modo Treino, e o ciclo segue do mesmo
 * jeito. Por isso este cálculo não consulta o banco nem olha sessões.
 */

/**
 * Índice da semana (0 = Semana 1) no ciclo em loop. Conta dias de calendário no fuso do
 * aparelho (a semana vira à meia-noite, não no horário exato da primeira abertura).
 * Devolve null quando não há data válida.
 */
export function calendarWeekIndex(
  startedAt: string | null | undefined,
  totalWeeks: number,
  now: Date = new Date(),
): number | null {
  if (!startedAt || totalWeeks < 1) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  // Compara datas (ano/mês/dia), não milissegundos: imune a horário de verão.
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.max(0, Math.round((today - startDay) / 86_400_000));
  return Math.floor(days / 7) % totalWeeks;
}

/**
 * Semana atual para a tela da aluna. `undefined` quando a periodização está desligada.
 * Sem data de abertura do protocolo (ainda não abriu) = Semana 1.
 * (O nome "use…" é só para não mudar quem chama: não usa nenhum hook do React.)
 */
export function useCurrentPeriodizationWeek(
  enabled: boolean,
  totalWeeks: number,
  startedAt?: string | null,
): number | undefined {
  if (!enabled) return undefined;
  return calendarWeekIndex(startedAt, totalWeeks) ?? 0;
}
