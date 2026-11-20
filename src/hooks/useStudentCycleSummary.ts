import { useQuery } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { queryKeys } from "@/lib/queryKeys";
import type { MealCheckLite, SessionLite } from "@/lib/coachCycleSummary";
import { isFeltRegion, type FeelRow } from "@/lib/exerciseFeel";

export interface StudentNote {
  sessionId: string;
  date: string;
  workoutLabel: string | null;
  note: string;
}

export interface CycleSummaryData {
  protocol: {
    id: string;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any> | null;
    createdAt: string;
    updatedAt: string;
    firstViewedAt: string | null;
  } | null;
  sessions: SessionLite[];
  meals: MealCheckLite[];
  lastCheckin: { id: string; submittedAt: string; answered: boolean; readByStudent: boolean } | null;
  notes: StudentNote[];
  /** "Onde você sentiu?" (últimos 60 dias). null = tabela ainda não existe no banco. */
  feel: FeelRow[] | null;
  /** Semana Corrida liberada para a aluna (null = não liberada ou SQL não aplicado). */
  busyWeek: { planName: string; enabled: boolean; studentOn: boolean; since: string | null; sessionsPerWeek: number } | null;
}

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/**
 * Tudo que o "Resumo do ciclo" da ficha precisa, numa ida só ao banco
 * (consultas em paralelo). Os cálculos ficam em lib/coachCycleSummary.ts.
 */
export function useStudentCycleSummary(studentId: string | null) {
  return useQuery({
    queryKey: queryKeys.coachCycleSummary(studentId),
    enabled: !!studentId,
    queryFn: async (): Promise<CycleSummaryData> => {
      const since = isoDaysAgo(35);
      const mealsSince = isoDaysAgo(9);
      const mealsSinceKey = `${mealsSince.getFullYear()}-${String(mealsSince.getMonth() + 1).padStart(2, "0")}-${String(mealsSince.getDate()).padStart(2, "0")}`;

      const feelSince = isoDaysAgo(60);
      const [protoRes, sessRes, mealRes, ciRes, feelRes, busyRes] = await Promise.all([
        sb.from("protocols")
          .select("id, name, payload, created_at, updated_at, student_first_viewed_at")
          .eq("student_id", studentId)
          .eq("is_template", false)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb.from("workout_sessions")
          .select("id, started_at, ended_at, notes, workout_label, workout_key")
          .eq("user_id", studentId)
          .gte("started_at", since.toISOString())
          .order("started_at", { ascending: false })
          .limit(80),
        // Sem a regra do pacote 5 no banco o coach não lê esta tabela: volta vazio (sem erro).
        sb.from("meal_checkins")
          .select("date, meal_index, checked")
          .eq("student_id", studentId)
          .gte("date", mealsSinceKey)
          .limit(200),
        sb.from("check_ins")
          .select("id, submitted_at, coach_feedback, feedback_read_at")
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb.from("workout_exercise_feel")
          .select("exercise_key, exercise_name, felt, created_at")
          .eq("user_id", studentId)
          .gte("created_at", feelSince.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
        sb.from("busy_week_assignments")
          .select("plan_name, enabled, student_on, student_on_since, payload")
          .eq("student_id", studentId)
          .maybeSingle(),
      ]);

      const sessionRows = (sessRes.data ?? []) as Array<{
        id: string; started_at: string; ended_at: string | null; notes: string | null; workout_label: string | null; workout_key?: string | null;
      }>;

      // Sessões sem "encerrar" mas com série concluída também contam como treino.
      const openIds = sessionRows.filter((s) => !s.ended_at).map((s) => s.id);
      const withSets = new Set<string>();
      if (openIds.length > 0) {
        const { data: sets } = await sb
          .from("workout_sets")
          .select("session_id")
          .in("session_id", openIds)
          .eq("completed", true)
          .limit(500);
        (sets ?? []).forEach((r: { session_id: string }) => withSets.add(r.session_id));
      }

      const p = protoRes.data as {
        id: string; name: string; payload: Record<string, unknown> | null;
        created_at: string; updated_at: string; student_first_viewed_at: string | null;
      } | null;
      const ci = ciRes.data as { id: string; submitted_at: string; coach_feedback: string | null; feedback_read_at: string | null } | null;

      return {
        protocol: p
          ? { id: p.id, name: p.name, payload: p.payload, createdAt: p.created_at, updatedAt: p.updated_at, firstViewedAt: p.student_first_viewed_at }
          : null,
        sessions: sessionRows.map((s) => ({ started_at: s.started_at, ended_at: s.ended_at, workout_key: s.workout_key ?? null, hasCompletedSets: withSets.has(s.id) })),
        meals: ((mealRes.data ?? []) as MealCheckLite[]),
        lastCheckin: ci
          ? {
              id: ci.id,
              submittedAt: ci.submitted_at,
              answered: !!(ci.coach_feedback && ci.coach_feedback.trim()),
              readByStudent: !!ci.feedback_read_at,
            }
          : null,
        busyWeek: (() => {
          const b = busyRes?.error ? null : (busyRes?.data as {
            plan_name: string; enabled: boolean; student_on: boolean; student_on_since: string | null; payload: { sessionsPerWeek?: unknown } | null;
          } | null);
          if (!b) return null;
          const spw = Number(b.payload?.sessionsPerWeek);
          return {
            planName: b.plan_name,
            enabled: !!b.enabled,
            studentOn: !!b.student_on,
            since: b.student_on_since,
            sessionsPerWeek: Number.isFinite(spw) && spw >= 1 && spw <= 6 ? spw : 3,
          };
        })(),
        feel: feelRes.error
          ? null
          : ((feelRes.data ?? []) as FeelRow[]).filter((r) => isFeltRegion(r.felt)),
        notes: sessionRows
          .filter((s) => s.notes && s.notes.trim())
          .slice(0, 8)
          .map((s) => ({ sessionId: s.id, date: s.started_at, workoutLabel: s.workout_label, note: s.notes!.trim() })),
      };
    },
  });
}
