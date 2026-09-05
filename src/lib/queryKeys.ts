/**
 * Chaves centralizadas do React Query.
 *
 * Migração incremental: as chamadas existentes que passam arrays literais
 * (ex.: `["student-supps-json", userId]`) continuam funcionando. Novas
 * páginas / refactors devem preferir estas factories para evitar drift.
 *
 * Nenhuma chave é renomeada aqui — apenas espelhamos os literais atuais.
 *
 * Duas correções em 2026-09 (auditoria de redundâncias, zip __11_):
 * `studentProtocol` apontava para `["student-protocol", userId]`, uma chave
 * que nunca existiu em nenhuma query real do app (a chave real, usada por
 * useStudentData.ts, é `["protocol", studentId]`) — corrigido, sem impacto
 * porque não havia consumidor. `coachFinances` não recebia `coachId`,
 * divergindo do hook real (useCoachFinances.ts sempre inclui) — hoje isso
 * não quebrava nada por causa do prefix-match do invalidateQueries, mas é a
 * mesma classe de risco do bug de contaminação entre alunos de julho/2026,
 * então corrigido também.
 */
export const queryKeys = {
  studentSupplements: (userId: string) => ["student-supps-json", userId] as const,
  studentRoutine: (userId: string) => ["student-routine-json", userId] as const,
  studentProfile: (userId: string) => ["student-profile", userId] as const,
  studentProtocol: (studentId: string | null) => ["protocol", studentId] as const,
  latestCoachFeedback: (studentId: string | undefined) =>
    ["latest-coach-feedback", studentId] as const,
  // Espelham exatamente as chaves usadas em src/hooks/useCoachStudents.ts.
  coachStudentsLite: (coachId: string | null) =>
    ["coach-students-lite", coachId] as const,
  coachStudentsSummary: (coachId: string | null, feedbackIntervalDays: number) =>
    ["coach-students-summary", coachId, feedbackIntervalDays] as const,
  coachStudentsDetail: (coachId: string | null, page: number, pageIds: string[]) =>
    ["coach-students-detail", coachId, page, pageIds.join(",")] as const,
  coachFinances: (coachId: string | null) => ["coach-finances", coachId] as const,

  // Espelham src/hooks/useStudentData.ts.
  sessionUserId: () => ["session-user-id"] as const,
  studentAnamnesis: (studentId: string | null) => ["anamnesis", studentId] as const,
  studentCheckIns: (studentId: string | null) => ["check-ins", studentId] as const,
  // Nova (não existia antes desta auditoria): objetivo do aluno, lido de
  // coach_plans.goal, usado para colorir deltas (peso) de acordo com a meta.
  studentGoal: (studentId: string | null) => ["student-goal", studentId] as const,
  // Espelha src/components/student/CoachUpdatesCard.tsx (consumidor) /
  // src/hooks/useStudentData.ts (quem invalida ao mudar protocol_change_events).
  coachUpdates: (studentId: string | null) => ["coach-updates", studentId] as const,

  // Espelham src/hooks/usePartnerships.ts.
  partnerProfile: (userId: string | null) => ["partner-profile", userId] as const,
  coachPartners: (coachId: string | null) => ["coach-partners", coachId] as const,
  allPartners: () => ["all-partners"] as const,
  partnerCommissions: (coachId: string | null, partnerId: string | null, all: boolean) =>
    ["partner-commissions", coachId, partnerId, all] as const,
  coachAccessCodes: (coachId: string | null) => ["coach-access-codes", coachId] as const,
  partnerReferrals: (partnerId: string | null) => ["partner-referrals", partnerId] as const,
  studentAttribution: (studentId: string | null) => ["student-attribution", studentId] as const,

  // Espelham src/hooks/useStudentPlans.ts. `coachId` opcional: as
  // invalidações de studentPlanCatalog propositalmente omitem o coachId
  // para invalidar todas as variantes em cache de uma vez (prefix match) —
  // preservado aqui.
  studentPlanCatalog: (coachId?: string | null) =>
    coachId === undefined
      ? (["student-plan-catalog"] as const)
      : (["student-plan-catalog", coachId] as const),
  coachStudentSubscriptions: (coachId?: string | null) =>
    coachId === undefined
      ? (["coach-student-subscriptions"] as const)
      : (["coach-student-subscriptions", coachId] as const),
  myStudentSubscription: (studentId: string | null | undefined) =>
    ["my-student-subscription", studentId] as const,

  // Espelha src/hooks/useCurrentPeriodizationWeek.ts.
  currentPeriodizationWeek: (userId: string, workoutKeys: string[]) =>
    ["current-periodization-week", userId, workoutKeys.join(",")] as const,
} as const;
