import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Goal } from "@/utils/macros";
import { getClinicalSignal, type ClinicalSignal } from "@/lib/checkInSchema";
import type { CoachInsightSituacao } from "@/lib/coachInsights";
import { queryKeys } from "@/lib/queryKeys";

export type AlertLevel = "critical" | "warning" | "ok";

export interface WeightTrend {
  deltaKg: number | null;
  direction: "up" | "down" | "flat" | null;
  isStagnant: boolean;
}

// Objetivos canônicos gravados em coach_plans.goal (sanitizados pelo goalMap
// em ProtocolBuilder). Qualquer string fora dessa lista é tratada como
// desconhecida — não geramos alerta de estagnação nesse caso.
const CANONICAL_GOALS: Goal[] = ["emagrecer", "manter", "hipertrofia", "recomposicao"];
const STAGNATION_MARGIN_KG = 0.3;

export interface StudentStatus {
  id: string;
  name: string;
  email: string;
  lastFeedback: string | null;
  lastAnamnesis: string | null;
  alertLevel: AlertLevel;
  daysInactive: number;
  daysSinceLastFeedback: number;
  lastWorkout: string | null;
  lastMeal: string | null;
  goal: string;
  currentWeight: number | null;
  targetWeight: number | null;
  feedbackIntervalDays: number;
  warningDays: number;
  criticalDays: number;
  weightTrend: WeightTrend;
  /** Segundo eixo: sinal clínico derivado do conteúdo do último check-in. */
  clinicalSignal: ClinicalSignal | null;
  /** Situação do Radar de Evolução (coach_insights); null se o aluno ainda não tem leitura. */
  insightSituacao: CoachInsightSituacao | null;
  /**
   * true enquanto o ALUNO ainda não abriu nenhum protocolo pela primeira vez
   * (ou o coach nem salvou protocolo ainda) e nunca enviou check-in. Nesse
   * estado o "radar" de feedback não começou a contar, então alertLevel fica
   * forçado em "ok" e a UI mostra "Aguardando abrir plano" em vez de
   * "Em dia"/dias sem feedback.
   */
  awaitingFirstProtocol: boolean;

}

export interface PagedStudentsResult {
  students: StudentStatus[];
  totalCount: number;
  filteredCount: number;
  stats: { total: number; critical: number; warning: number; ok: number };
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function getAlertLevel(
  lastFeedback: string | null,
  warningDays: number,
  criticalDays: number
): AlertLevel {
  const d = daysSince(lastFeedback);
  if (d >= criticalDays) return "critical";
  if (d >= warningDays) return "warning";
  return "ok";
}

// NOTA: a antiga variante full-scan useCoachStudents() foi removida.
// Use useCoachStudentsPaged() para a listagem principal (paginada) ou
// useCoachStudentsLite() para telas que só precisam de id/name/lastAnamnesis.

// ─── Lightweight variant ──────────────────────────────────────────────────
// Usada por telas que só precisam de id/name/lastAnamnesis (ex: aba Finanças).
// Evita o full-scan de check_ins/anamnesis/coach_plans sem .limit() que a
// variante antiga useCoachStudents() fazia a cada carregamento.
export interface StudentLite {
  id: string;
  name: string;
  lastAnamnesis: string | null;
  /** Aluno isento de cobrança — some de totais, alertas e fila de prioridade. */
  isExempt: boolean;
}

export function useCoachStudentsLite(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.coachStudentsLite(coachId),
    enabled: !!coachId,
    queryFn: async (): Promise<StudentLite[]> => {
      if (!coachId) return [];

      const { data: links } = await supabase
        .from("coach_students")
        .select("student_id, is_exempt")
        .eq("coach_id", coachId)
        .eq("status", "active");

      if (!links || links.length === 0) return [];
      const ids = links.map((l) => l.student_id);
      const exemptById = new Map<string, boolean>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        links.map((l: any) => [l.student_id, !!l.is_exempt])
      );

      const [{ data: sProfiles }, { data: profiles }, { data: ana }] = await Promise.all([
        supabase.from("student_profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids),
        supabase
          .from("anamnesis")
          .select("student_id, submitted_at, updated_at")
          .in("student_id", ids)
          .order("updated_at", { ascending: false })
          .limit(ids.length * 3), // teto de segurança — ver nota equivalente em useCoachStudentsPaged
      ]);

      const anaByStudent = new Map<string, { submitted_at: string | null; updated_at: string | null }>();
      ana?.forEach((a) => { if (!anaByStudent.has(a.student_id)) anaByStudent.set(a.student_id, a); });

      return ids.map((sid) => {
        const sp = sProfiles?.find((p) => p.user_id === sid);
        const pp = profiles?.find((p) => p.user_id === sid);
        const a = anaByStudent.get(sid);
        const name =
          sp?.full_name ||
          pp?.full_name ||
          (pp?.email ? pp.email.split("@")[0] : "") ||
          `Aluno ${sid.slice(0, 6)}`;
        return {
          id: sid,
          name,
          lastAnamnesis: a?.submitted_at || a?.updated_at || null,
          isExempt: exemptById.get(sid) ?? false,
        };
      });
    },
  });
}

// ─── Paginated variant ───────────────────────────────────────────────────────
// [FIX] Fase A usa .range() no banco (paginação real). pageSize=60 cobre o
// teto projetado de ~50 alunos/coach numa única página — sem N+1.
//
// [FIX 2] Busca (search) e filtro de status (filter) agora são aplicados
// ANTES da paginação, sobre o conjunto completo de alunos ativos do coach —
// não apenas sobre os 60 já trazidos da página atual. Antes, search/filter
// filtravam em memória os resultados de uma página já fatiada pelo banco,
// o que podia mostrar lista vazia mesmo havendo alunos correspondentes
// fora dessa fatia. Como o teto é ~50-60 alunos/coach, isso não é um
// problema de performance — é só ordem de operações.
export function useCoachStudentsPaged(
  coachId: string | null,
  feedbackIntervalDays: number,
  opts: { page: number; pageSize: number; search?: string; filter?: "all" | AlertLevel } = {
    page: 0,
    pageSize: 60, // cobre o teto projetado de 50 alunos/coach em 1 página só
    search: "",
    filter: "all",
  }
) {
  const { page, pageSize, search = "", filter = "all" } = opts;

  // PHASE A — traz TODOS os alunos ativos do coach (teto ~50-60, então é
  // barato), calcula alertLevel para cada um, aplica search + filter sobre
  // o conjunto completo, e só então pagina o resultado já filtrado.
  const summaryQuery = useQuery({
    queryKey: queryKeys.coachStudentsSummary(coachId, feedbackIntervalDays),
    enabled: !!coachId,
    queryFn: async () => {
      if (!coachId) return { rows: [] as StudentStatus[] };

      const { data: links, error: linksErr } = await supabase
        .from("coach_students")
        .select("student_id, feedback_interval_days, warning_days, critical_days")
        .eq("coach_id", coachId)
        .eq("status", "active");

      if (linksErr) throw linksErr;
      if (!links || links.length === 0) return { rows: [] as StudentStatus[] };
      const ids = links.map((l) => l.student_id);

      const [{ data: sProfiles }, { data: profiles }, { data: lastCi }, { data: protoRows }] = await Promise.all([
        supabase.from("student_profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids),
        supabase
          .from("check_ins")
          .select("student_id, submitted_at, updated_at, payload")
          .in("student_id", ids)
          .order("submitted_at", { ascending: false })
          .limit(ids.length * 3), // teto explícito, evita full-scan se aluno tiver muitos check-ins
        supabase
          .from("protocols")
          .select("student_id, created_at, student_first_viewed_at")
          .in("student_id", ids)
          .eq("is_template", false)
          .order("created_at", { ascending: true }), // o primeiro da lista por aluno = 1º protocolo salvo
      ]);


      // O "último check-in" mede o atraso DO ALUNO, então usa somente
      // submitted_at. Usar updated_at aqui fazia um check-in antigo virar o
      // "mais recente" quando o coach editava o feedback dele depois — e o
      // aluno aparecia atrasado mesmo tendo enviado um check-in novo.
      const effectiveTime = (c: { submitted_at: string }) =>
        new Date(c.submitted_at).getTime();

      const lastCiByStudent = new Map<string, string>();
      const lastCiTimeByStudent = new Map<string, number>();
      const lastCiPayloadByStudent = new Map<string, Record<string, unknown> | null>();
      lastCi?.forEach((c) => {
        const t = effectiveTime(c);
        const prevT = lastCiTimeByStudent.get(c.student_id);
        if (prevT === undefined || t > prevT) {
          lastCiTimeByStudent.set(c.student_id, t);
          lastCiByStudent.set(c.student_id, c.submitted_at);
          lastCiPayloadByStudent.set(
            c.student_id,
            ((c as { payload?: unknown }).payload as Record<string, unknown>) ?? null
          );
        }
      });

      // Data em que o ALUNO abriu um protocolo pela primeira vez. É esse
      // momento — e não o "coach salvou" — que liga o radar de feedback.
      const firstViewByStudent = new Map<string, string>();
      protoRows?.forEach((p) => {
        const viewed = (p as { student_first_viewed_at?: string | null }).student_first_viewed_at;
        if (!viewed) return;
        const prev = firstViewByStudent.get(p.student_id);
        if (!prev || new Date(viewed).getTime() < new Date(prev).getTime()) {
          firstViewByStudent.set(p.student_id, viewed);
        }
      });


      const rows: StudentStatus[] = ids.map((sid) => {
        const sp = sProfiles?.find((p) => p.user_id === sid);
        const pp = profiles?.find((p) => p.user_id === sid);
        const link = links.find((l) => l.student_id === sid)!;
        const warning = link.warning_days ?? 14;
        const critical = link.critical_days ?? 16;
        const interval = link.feedback_interval_days ?? feedbackIntervalDays ?? 14;
        const lastFeedback = lastCiByStudent.get(sid) ?? null;
        const firstOpenedAt = firstViewByStudent.get(sid) ?? null;

        // O radar só liga quando o aluno ABRIU o protocolo pela primeira vez
        // (ou quando ele já enviou algum check-in, caso de alunos antigos).
        // Antes disso nunca é crítico/atenção.
        const awaitingFirstProtocol = !firstOpenedAt && !lastFeedback;
        // Referência pra contar dias: último check-in ou, na falta dele, a
        // primeira abertura do protocolo pelo aluno.
        const referenceDate = lastFeedback ?? firstOpenedAt;

        const name =
          sp?.full_name ||
          pp?.full_name ||
          (pp?.email ? pp.email.split("@")[0] : "") ||
          `Aluno ${sid.slice(0, 6)}`;
        return {
          id: sid,
          name,
          email: pp?.email || "",
          lastAnamnesis: null,
          lastFeedback,
          lastWorkout: null,
          lastMeal: null,
          alertLevel: awaitingFirstProtocol ? "ok" : getAlertLevel(referenceDate, warning, critical),
          awaitingFirstProtocol,
          daysInactive: awaitingFirstProtocol ? 0 : daysSince(referenceDate),
          daysSinceLastFeedback: awaitingFirstProtocol ? 0 : daysSince(referenceDate),
          goal: "—",
          currentWeight: null,
          targetWeight: null,
          feedbackIntervalDays: interval,
          warningDays: warning,
          criticalDays: critical,
          weightTrend: { deltaKg: null, direction: null, isStagnant: false },
          clinicalSignal: getClinicalSignal(lastCiPayloadByStudent.get(sid) ?? null),
          insightSituacao: null,
        };
      });

      rows.sort((a, b) => {
        const order: Record<AlertLevel, number> = { critical: 0, warning: 1, ok: 2 };
        return order[a.alertLevel] - order[b.alertLevel];
      });

      return { rows };
    },
  });

  const allRows = summaryQuery.data?.rows ?? [];

  // Stats globais: sempre sobre o conjunto completo de alunos ativos do
  // coach, não sobre a página filtrada — o card de resumo (críticos/
  // atenção/ok) deve refletir o roster inteiro, independente do que o
  // coach está buscando/filtrando no momento.
  const stats = {
    total: allRows.length,
    critical: allRows.filter((s) => s.alertLevel === "critical").length,
    warning: allRows.filter((s) => s.alertLevel === "warning").length,
    ok: allRows.filter((s) => s.alertLevel === "ok").length,
  };

  // [FIX] search + filter aplicados sobre o conjunto completo, ANTES da
  // paginação — corrige o bug de lista vazia ao buscar/filtrar.
  const filtered = allRows.filter((s) => {
    const matchSearch = (s.name || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || s.alertLevel === filter;
    return matchSearch && matchFilter;
  });

  const filteredCount = filtered.length;
  const totalCount = allRows.length;

  // Paginação em memória sobre o resultado já filtrado. Com o teto de
  // ~50-60 alunos/coach isso é trivial; se o teto crescer muito no futuro,
  // mover search/filter para .ilike()/.in() no Supabase antes do .range().
  const pageStart = page * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const pageIds = pageRows.map((s) => s.id);

  // PHASE B — enriquecimento pesado, só dos alunos filtrados na página atual.
  const detailQuery = useQuery({
    queryKey: queryKeys.coachStudentsDetail(coachId, page, pageIds),
    enabled: !!coachId && pageIds.length > 0,
    queryFn: async () => {
      const [{ data: ana }, { data: ci }, { data: plans }, { data: insights }] = await Promise.all([
        supabase
          .from("anamnesis")
          .select("student_id, submitted_at, updated_at, baseline_metrics")
          .in("student_id", pageIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("check_ins")
          .select("student_id, submitted_at, updated_at, current_metrics")
          .in("student_id", pageIds)
          .order("submitted_at", { ascending: false })
          .limit(pageIds.length * 3), // teto de segurança — limit(pageIds.length) sozinho NÃO garante
          // 1 check-in por aluno: como a ordenação mistura check-ins de todos os
          // alunos da página, um aluno com vários check-ins recentes pode "tomar"
          // as vagas de outro aluno com check-ins mais espaçados, fazendo esse
          // outro aluno cair no fallback do peso da Anamnese (baseline) em vez do
          // peso do check-in mais recente dele.
        supabase
          .from("coach_plans")
          .select("student_id, goal")
          .in("student_id", pageIds)
          .eq("coach_id", coachId!),
        supabase
          .from("coach_insights")
          .select("student_id, situacao")
          .in("student_id", pageIds),
      ]);

      const anaBy = new Map<string, { submitted_at: string | null; updated_at: string | null; baseline_metrics: Record<string, unknown> | null }>();
      ana?.forEach((a) => {
        if (!anaBy.has(a.student_id)) {
          anaBy.set(a.student_id, {
            submitted_at: a.submitted_at,
            updated_at: a.updated_at,
            baseline_metrics: (a.baseline_metrics as Record<string, unknown>) || null,
          });
        }
      });
      // Retemos os DOIS check-ins mais recentes por aluno (por submitted_at —
      // edição de feedback pelo coach não reordena o histórico). O mais
      // recente alimenta o peso atual; o anterior, a tendência (weightTrend).
      type CiRow = { submitted_at: string; current_metrics: Record<string, unknown> | null; t: number };
      const ciByAll = new Map<string, CiRow[]>();
      ci?.forEach((c) => {
        const t = new Date(c.submitted_at).getTime();
        const row: CiRow = {
          submitted_at: c.submitted_at,
          current_metrics: (c.current_metrics as Record<string, unknown>) || null,
          t,
        };
        const arr = ciByAll.get(c.student_id) ?? [];
        arr.push(row);
        ciByAll.set(c.student_id, arr);
      });
      const ciBy = new Map<string, { submitted_at: string; current_metrics: Record<string, unknown> | null }>();
      const ciPrevBy = new Map<string, { submitted_at: string; current_metrics: Record<string, unknown> | null }>();
      ciByAll.forEach((arr, sid) => {
        arr.sort((a, b) => b.t - a.t);
        if (arr[0]) ciBy.set(sid, { submitted_at: arr[0].submitted_at, current_metrics: arr[0].current_metrics });
        if (arr[1]) ciPrevBy.set(sid, { submitted_at: arr[1].submitted_at, current_metrics: arr[1].current_metrics });
      });
      const planBy = new Map<string, string>();
      plans?.forEach((p) => {
        if (!planBy.has(p.student_id)) planBy.set(p.student_id, p.goal || "—");
      });

      const insightBy = new Map<string, CoachInsightSituacao>();
      insights?.forEach((i) => {
        if (i.situacao && !insightBy.has(i.student_id)) {
          insightBy.set(i.student_id, i.situacao as CoachInsightSituacao);
        }
      });

      return { anaBy, ciBy, ciPrevBy, planBy, insightBy };
    },
  });

  const parseWeight = (raw: unknown): number | null => {
    if (typeof raw === "number" && isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw.replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  };

  const enrichedPage: StudentStatus[] = pageRows.map((s) => {
    const d = detailQuery.data;
    if (!d) return s;
    const a = d.anaBy.get(s.id);
    const c = d.ciBy.get(s.id);
    const cPrev = d.ciPrevBy.get(s.id);
    const goal = d.planBy.get(s.id) || "—";
    const ciM = (c?.current_metrics as Record<string, unknown>) || {};
    const baseM = (a?.baseline_metrics as Record<string, unknown>) || {};
    const v = ciM.peso ?? ciM.weight ?? baseM.peso;
    const currentWeight = parseWeight(v);

    // weightTrend: compara peso do check-in mais recente com o do anterior.
    // Fallback: se só houver 1 check-in, usa peso da anamnese (baseline).
    const latestWeight = parseWeight(ciM.peso ?? ciM.weight);
    const prevWeight =
      parseWeight((cPrev?.current_metrics as Record<string, unknown> | null)?.peso
                  ?? (cPrev?.current_metrics as Record<string, unknown> | null)?.weight)
      ?? parseWeight(baseM.peso ?? baseM.weight);

    let weightTrend: WeightTrend = { deltaKg: null, direction: null, isStagnant: false };
    if (latestWeight != null && prevWeight != null) {
      const deltaKg = Math.round((latestWeight - prevWeight) * 10) / 10;
      const direction: "up" | "down" | "flat" =
        Math.abs(deltaKg) < 0.05 ? "flat" : deltaKg > 0 ? "up" : "down";
      const isCanonicalGoal = (CANONICAL_GOALS as string[]).includes(goal);
      const isStagnant =
        Math.abs(deltaKg) < STAGNATION_MARGIN_KG &&
        isCanonicalGoal &&
        (goal as Goal) !== "manter";
      weightTrend = { deltaKg, direction, isStagnant };
    }

    return {
      ...s,
      lastAnamnesis: a?.submitted_at || a?.updated_at || null,
      goal,
      currentWeight,
      weightTrend,
      insightSituacao: d.insightBy.get(s.id) ?? null,
    };
  });

  return {
    students: enrichedPage,
    totalCount,
    filteredCount,
    stats,
    isLoading: summaryQuery.isLoading,
    isFetchingDetail: detailQuery.isFetching,
  };
}
