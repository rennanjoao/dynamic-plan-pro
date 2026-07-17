/**
 * Chaves centralizadas do React Query.
 *
 * Migração incremental: as chamadas existentes que passam arrays literais
 * (ex.: `["student-supps-json", userId]`) continuam funcionando. Novas
 * páginas / refactors devem preferir estas factories para evitar drift.
 *
 * Nenhuma chave é renomeada aqui — apenas espelhamos os literais atuais.
 */
export const queryKeys = {
  studentSupplements: (userId: string) => ["student-supps-json", userId] as const,
  studentRoutine: (userId: string) => ["student-routine-json", userId] as const,
  studentProfile: (userId: string) => ["student-profile", userId] as const,
  studentProtocol: (userId: string) => ["student-protocol", userId] as const,
  latestCoachFeedback: (studentId: string | undefined) =>
    ["latest-coach-feedback", studentId] as const,
  coachStudents: (coachId: string | undefined) => ["coach-students", coachId] as const,
} as const;