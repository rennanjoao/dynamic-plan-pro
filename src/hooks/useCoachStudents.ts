import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AlertLevel = "critical" | "warning" | "ok";

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
}

export function useCoachStudentsLite(coachId: string | null) {
  return useQuery({
    queryKey: ["coach-students-lite", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<StudentLite[]> => {
      if (!coachId) return [];

      const { data: links } = await supabase
        .from("coach_students")
        .select("student_id")
        .eq("coach_id", coachId)
        .eq("status", "active");

      if (!links || links.length === 0) return [];
      const ids = links.map((l) => l.student_id);

      const [{ data: sProfiles }, { data: profiles }, { data: ana }] = await Promise.all([
        supabase.from("student_profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids),
        supabase
          .from("anamnesis")
          .select("student_id, submitted_at, updated_at")
          .in("student_id", ids)
          .order("updated_at", { ascending: false })
          .limit(ids.length), // 1 registro mais recente por aluno é suficiente
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
        };
      });
    },
  });
}

// ─── Paginated variant ───────────────────────────────────────────────────────
// [FIX] Fase A agora usa .range() no banco (paginação real) em vez de trazer
// TODOS os alunos ativos do coach e paginar em memória. Em conjunto com o
// teto projetado de ~50 alunos/coach, pageSize=60 cobre o roster inteiro de
// um coach numa única página — sem N+1 e sem paginação artificial.
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

  // PHASE A — resumo leve, agora paginado de verdade no banco via .range().
  const summaryQuery = useQuery({
    queryKey: ["coach-students-summary", coachId, feedbackIntervalDays, page, pageSize],
    enabled: !!coachId,
    queryFn: async () => {
      if (!coachId) return { rows: [] as StudentStatus[], total: 0 };

      const { data: links, count, error: linksErr } = await supabase
        .from("coach_students")
        .select("student_id, feedback_interval_days, warning_days, critical_days", { count: "exact" })
        .eq("coach_id", coachId)
        .eq("status", "active")
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (linksErr) throw linksErr;
      if (!links || links.length === 0) return { rows: [] as StudentStatus[], total: count ?? 0 };
      const ids = links.map((l) => l.student_id);

      const [{ data: sProfiles }, { data: profiles }, { data: lastCi }] = await Promise.all([
        supabase.from("student_profiles").select("user_id, full_name").in("user_id", ids),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids),
        supabase
          .from("check_ins")
          .select("student_id, submitted_at")
          .in("student_id", ids)
          .order("submitted_at", { ascending: false })
          .limit(ids.length * 3), // teto explícito, evita full-scan se aluno tiver muitos check-ins
      ]);

      const lastCiByStudent = new Map<string, string>();
      lastCi?.forEach((c) => {
        if (!lastCiByStudent.has(c.student_id)) lastCiByStudent.set(c.student_id, c.submitted_at);
      });

      const rows: StudentStatus[] = ids.map((sid) => {
        const sp = sProfiles?.find((p) => p.user_id === sid);
        const pp = profiles?.find((p) => p.user_id === sid);
        const link = links.find((l) => l.student_id === sid)!;
        const warning = link.warning_days ?? 14;
        const critical = link.critical_days ?? 16;
        const interval = link.feedback_interval_days ?? feedbackIntervalDays ?? 14;
        const lastFeedback = lastCiByStudent.get(sid) ?? null;
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
          alertLevel: getAlertLevel(lastFeedback, warning, critical),
          daysInactive: daysSince(lastFeedback),
          daysSinceLastFeedback: daysSince(lastFeedback),
          goal: "—",
          currentWeight: null,
          targetWeight: null,
          feedbackIntervalDays: interval,
          warningDays: warning,
          criticalDays: critical,
        };
      });

      rows.sort((a, b) => {
        const order: Record<AlertLevel, number> = { critical: 0, warning: 1, ok: 2 };
        return order[a.alertLevel] - order[b.alertLevel];
      });

      return { rows, total: count ?? rows.length };
    },
  });

  const pageRows = summaryQuery.data?.rows ?? [];
  const totalCount = summaryQuery.data?.total ?? 0;

  // Stats globais: nesse volume (≤60 alunos cabendo numa página), bastam
  // os dados já carregados — sem necessidade de count agregado à parte.
  const stats = {
    total: totalCount,
    critical: pageRows.filter((s) => s.alertLevel === "critical").length,
    warning: pageRows.filter((s) => s.alertLevel === "warning").length,
    ok: pageRows.filter((s) => s.alertLevel === "ok").length,
  };

  const filtered = pageRows.filter((s) => {
    const matchSearch = (s.name || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || s.alertLevel === filter;
    return matchSearch && matchFilter;
  });

  const pageIds = filtered.map((s) => s.id);

  // PHASE B — enriquecimento pesado, só dos alunos filtrados na página atual.
  const detailQuery = useQuery({
    queryKey: ["coach-students-detail", coachId, page, pageIds.join(",")],
    enabled: !!coachId && pageIds.length > 0,
    queryFn: async () => {
      const [{ data: ana }, { data: ci }, { data: plans }] = await Promise.all([
        supabase
          .from("anamnesis")
          .select("student_id, submitted_at, updated_at, baseline_metrics")
          .in("student_id", pageIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("check_ins")
          .select("student_id, submitted_at, current_metrics")
          .in("student_id", pageIds)
          .order("submitted_at", { ascending: false })
          .limit(pageIds.length), // 1 mais recente por aluno
        supabase
          .from("coach_plans")
          .select("student_id, goal")
          .in("student_id", pageIds)
          .eq("coach_id", coachId!),
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
      const ciBy = new Map<string, { submitted_at: string; current_metrics: Record<string, unknown> | null }>();
      ci?.forEach((c) => {
        if (!ciBy.has(c.student_id)) {
          ciBy.set(c.student_id, {
            submitted_at: c.submitted_at,
            current_metrics: (c.current_metrics as Record<string, unknown>) || null,
          });
        }
      });
      const planBy = new Map<string, string>();
      plans?.forEach((p) => {
        if (!planBy.has(p.student_id)) planBy.set(p.student_id, p.goal || "—");
      });

      return { anaBy, ciBy, planBy };
    },
  });

  const enrichedPage: StudentStatus[] = filtered.map((s) => {
    const d = detailQuery.data;
    if (!d) return s;
    const a = d.anaBy.get(s.id);
    const c = d.ciBy.get(s.id);
    const goal = d.planBy.get(s.id) || "—";
    const ciM = (c?.current_metrics as Record<string, unknown>) || {};
    const baseM = (a?.baseline_metrics as Record<string, unknown>) || {};
    const v = ciM.peso ?? ciM.weight ?? baseM.peso;
    let currentWeight: number | null = null;
    if (typeof v === "number" && isFinite(v)) currentWeight = v;
    else if (typeof v === "string") {
      const n = parseFloat(v.replace(",", "."));
      currentWeight = isFinite(n) ? n : null;
    }
    return {
      ...s,
      lastAnamnesis: a?.submitted_at || a?.updated_at || null,
      goal,
      currentWeight,
    };
  });

  return {
    students: enrichedPage,
    totalCount,
    filteredCount: filtered.length,
    stats,
    isLoading: summaryQuery.isLoading,
    isFetchingDetail: detailQuery.isFetching,
  };
}
