/**
 * Semana Corrida — dados do coach (biblioteca e cópias por aluna) e da aluna
 * (plano liberado, escolha dela e sessões recentes). Regras em src/lib/busyWeek.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { queryKeys } from "@/lib/queryKeys";
import { isMissingTableError } from "@/hooks/usePostureQuickChecks";
import { normalizeBusyForSave, normalizeBusyPayload, type BusyKind, type BusyWeekPayload } from "@/lib/busyWeek";
import type { SessionMark } from "@/lib/workoutInversion";

export const BUSY_SQL_MISSING_MSG =
  "A Semana Corrida precisa do SQL novo (MIGRATION_SEMANA_CORRIDA.sql). Rode o arquivo no SQL Editor do Lovable.";

export interface BusyWeekPlan {
  id: string;
  name: string;
  kind: BusyKind;
  payload: BusyWeekPayload;
  updated_at: string;
}

export interface BusyWeekAssignment {
  id: string;
  student_id: string;
  coach_id: string;
  plan_id: string | null;
  plan_name: string;
  kind: BusyKind;
  payload: BusyWeekPayload;
  plan_synced_at: string | null;
  customized: boolean;
  enabled: boolean;
  student_on: boolean;
  student_on_since: string | null;
  updated_at: string;
}

const kindOf = (k: unknown): BusyKind => (k === "upper_lower" ? "upper_lower" : "fullbody");

function toPlan(r: Record<string, unknown>): BusyWeekPlan {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    kind: kindOf(r.kind),
    payload: normalizeBusyPayload(r.payload),
    updated_at: String(r.updated_at ?? ""),
  };
}

function toAssignment(r: Record<string, unknown>): BusyWeekAssignment {
  return {
    id: String(r.id),
    student_id: String(r.student_id),
    coach_id: String(r.coach_id),
    plan_id: (r.plan_id as string | null) ?? null,
    plan_name: String(r.plan_name ?? ""),
    kind: kindOf(r.kind),
    payload: normalizeBusyPayload(r.payload),
    plan_synced_at: (r.plan_synced_at as string | null) ?? null,
    customized: !!r.customized,
    enabled: !!r.enabled,
    student_on: !!r.student_on,
    student_on_since: (r.student_on_since as string | null) ?? null,
    updated_at: String(r.updated_at ?? ""),
  };
}

// ── Coach ────────────────────────────────────────────────────────────────────

export function useBusyWeekPlans(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.busyWeekPlans(coachId),
    enabled: !!coachId,
    retry: false,
    queryFn: async (): Promise<{ plans: BusyWeekPlan[]; missingTable: boolean }> => {
      const { data, error } = await sb
        .from("busy_week_plans")
        .select("id, name, kind, payload, updated_at")
        .eq("coach_id", coachId)
        .order("updated_at", { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return { plans: [], missingTable: true };
        throw error;
      }
      return { plans: ((data ?? []) as Record<string, unknown>[]).map(toPlan), missingTable: false };
    },
  });
}

export function useBusyWeekAssignments(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.busyWeekAssignments(coachId),
    enabled: !!coachId,
    retry: false,
    queryFn: async (): Promise<BusyWeekAssignment[]> => {
      // A política só devolve alunas com vínculo ativo com este coach.
      const { data, error } = await sb
        .from("busy_week_assignments")
        .select("id, student_id, coach_id, plan_id, plan_name, kind, payload, plan_synced_at, customized, enabled, student_on, student_on_since, updated_at");
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return ((data ?? []) as Record<string, unknown>[]).map(toAssignment);
    },
  });
}

function useInvalidateBusy(coachId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.busyWeekPlans(coachId) });
    qc.invalidateQueries({ queryKey: queryKeys.busyWeekAssignments(coachId) });
    qc.invalidateQueries({ queryKey: ["coach-cycle-summary"] });
  };
}

export function useSaveBusyWeekPlan(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; kind: BusyKind; payload: BusyWeekPayload }): Promise<BusyWeekPlan> => {
      const row = { name: input.name.trim(), kind: input.kind, payload: normalizeBusyForSave(input.payload) };
      const q = input.id
        ? sb.from("busy_week_plans").update(row).eq("id", input.id)
        : sb.from("busy_week_plans").insert({ ...row, coach_id: coachId });
      const { data, error } = await q.select("id, name, kind, payload, updated_at").single();
      if (error) throw new Error(isMissingTableError(error) ? BUSY_SQL_MISSING_MSG : error.message);
      return toPlan(data as Record<string, unknown>);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBusyWeekPlan(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("busy_week_plans").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/**
 * Ativa (ou reaplica) um plano para várias alunas: cada uma recebe uma cópia
 * independente. Reaplicar descarta o ajuste individual daquela aluna.
 */
export function useApplyBusyWeekPlan(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async ({ plan, studentIds }: { plan: BusyWeekPlan; studentIds: string[] }) => {
      if (studentIds.length === 0) return 0;
      const now = new Date().toISOString();
      const safePayload = normalizeBusyForSave(plan.payload);
      const rows = studentIds.map((student_id) => ({
        student_id,
        coach_id: coachId,
        plan_id: plan.id,
        plan_name: plan.name,
        kind: plan.kind,
        payload: safePayload,
        plan_synced_at: plan.updated_at || now,
        customized: false,
        enabled: true,
      }));
      const { error } = await sb.from("busy_week_assignments").upsert(rows, { onConflict: "student_id" });
      if (error) throw new Error(isMissingTableError(error) ? BUSY_SQL_MISSING_MSG : error.message);
      return rows.length;
    },
    onSuccess: invalidate,
  });
}

export function useSetBusyWeekEnabled(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async ({ studentIds, enabled }: { studentIds: string[]; enabled: boolean }) => {
      if (studentIds.length === 0) return;
      const { error } = await sb
        .from("busy_week_assignments")
        .update({ enabled, coach_id: coachId })
        .in("student_id", studentIds);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Ajuste só desta aluna (a cópia passa a ser "ajustada"). */
export function useSaveAssignmentPayload(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async ({ studentId, payload }: { studentId: string; payload: BusyWeekPayload }) => {
      const { error } = await sb
        .from("busy_week_assignments")
        .update({ payload: normalizeBusyForSave(payload), customized: true, coach_id: coachId })
        .eq("student_id", studentId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/**
 * Salva a Semana Corrida de UMA aluna direto do protocolo (montada do zero,
 * copiada do treino atual ou a partir de um plano da biblioteca). Cria a
 * cópia dela se ainda não existir e já deixa liberada.
 */
export function useUpsertStudentBusyWeek(coachId: string | null) {
  const invalidate = useInvalidateBusy(coachId);
  return useMutation({
    mutationFn: async (input: {
      studentId: string;
      planId: string | null;
      planName: string;
      kind: BusyKind;
      payload: BusyWeekPayload;
      /** true quando ela tem plano da biblioteca e o coach mudou só a dela. */
      customized: boolean;
      planSyncedAt?: string | null;
    }) => {
      const row: Record<string, unknown> = {
        student_id: input.studentId,
        coach_id: coachId,
        plan_id: input.planId,
        plan_name: input.planName.slice(0, 120),
        kind: input.kind,
        payload: normalizeBusyForSave(input.payload),
        customized: input.customized,
        enabled: true,
      };
      if (input.planSyncedAt !== undefined) row.plan_synced_at = input.planSyncedAt;
      const { error } = await sb.from("busy_week_assignments").upsert(row, { onConflict: "student_id" });
      if (error) throw new Error(isMissingTableError(error) ? BUSY_SQL_MISSING_MSG : error.message);
    },
    onSuccess: invalidate,
  });
}

// ── Aluna ────────────────────────────────────────────────────────────────────

export interface StudentBusyWeek {
  /** Plano liberado pelo coach (null = nada liberado ou SQL não aplicado). */
  assignment: BusyWeekAssignment | null;
  /** A aluna está usando a Semana Corrida agora. */
  active: boolean;
  /** Sessões dos últimos ~2 meses (para rotação, inversão e tipo do dia). */
  sessions: SessionMark[];
}

export function useStudentBusyWeek(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.studentBusyWeek(userId ?? null),
    enabled: !!userId,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<StudentBusyWeek> => {
      const since = new Date();
      since.setDate(since.getDate() - 70);
      const [a, s] = await Promise.all([
        sb
          .from("busy_week_assignments")
          .select("id, student_id, coach_id, plan_id, plan_name, kind, payload, plan_synced_at, customized, enabled, student_on, student_on_since, updated_at")
          .eq("student_id", userId)
          .maybeSingle(),
        sb
          .from("workout_sessions")
          .select("workout_key, started_at")
          .eq("user_id", userId)
          .gte("started_at", since.toISOString())
          .order("started_at", { ascending: false })
          .limit(200),
      ]);
      const assignment = !a.error && a.data ? toAssignment(a.data as Record<string, unknown>) : null;
      const usable = assignment && assignment.enabled && assignment.payload.workouts.length > 0 ? assignment : null;
      return {
        assignment: usable,
        active: !!usable?.student_on,
        sessions: ((s.data ?? []) as SessionMark[]).filter((r) => r?.workout_key && r?.started_at),
      };
    },
  });
}

export function useSetMyBusyWeekMode(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await sb.rpc("set_busy_week_mode", { p_on: on });
      if (error) throw new Error(/não está liberada/i.test(error.message) ? "Seu treinador ainda não liberou a Semana Corrida." : "Não foi possível trocar agora. Tente de novo.");
      return on;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.studentBusyWeek(userId ?? null) });
      qc.invalidateQueries({ queryKey: ["student-today-plan", userId] });
    },
  });
}
