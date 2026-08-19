/**
 * useStudentPlans.ts — catálogo dos planos dos ALUNOS e contrato vigente.
 * Domínio separado do billing da plataforma (platform_billing_charges).
 *
 * Catálogo é por coach: cada coach só enxerga (e só pode editar) os próprios
 * planos, mais os planos padrão/legado (coach_id null) como fallback.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STUDENT_PLANS, type StudentPlan } from "@/lib/studentPlans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export interface StudentSubscription {
  id: string;
  student_id: string;
  coach_id: string;
  plan_slug: string;
  plan_name: string;
  price_cents: number;
  cycle_months: number;
  started_on: string;
  next_due_date: string | null;
  ends_on: string | null;
  status: string;
  current_charge_id: string | null;
  payment_method: string | null;
  payment_source: string | null;
  provider: string | null;
}

/**
 * Catálogo de planos visível para um coach: os planos dele + os planos
 * padrão (coach_id null), usados como fallback pra quem não cadastrou nada.
 * Sem coachId, retorna só os planos padrão.
 */
export function useStudentPlanCatalog(coachId?: string | null) {
  return useQuery({
    queryKey: ["student-plan-catalog", coachId ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StudentPlan[]> => {
      let query = sb.from("student_plan_catalog").select("*").eq("is_active", true);
      query = coachId ? query.or(`coach_id.eq.${coachId},coach_id.is.null`) : query.is("coach_id", null);
      const { data, error } = await query.order("sort_order", { ascending: true });
      // Fallback compatível: nunca quebra a tela se o catálogo falhar.
      if (error || !data || data.length === 0) return DEFAULT_STUDENT_PLANS;
      return data as StudentPlan[];
    },
  });
}

export interface PlanFormInput {
  id?: string;
  slug: string;
  name: string;
  price_cents: number;
  duration_months: number;
  description?: string | null;
  benefits: string[];
  is_active: boolean;
  sort_order?: number;
}

/** Cria ou atualiza um plano próprio do coach. */
export function useSavePlan(coachId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PlanFormInput) => {
      const row = {
        coach_id: coachId,
        slug: plan.slug,
        name: plan.name,
        price_cents: plan.price_cents,
        duration_months: plan.duration_months,
        description: plan.description ?? null,
        benefits: plan.benefits,
        is_active: plan.is_active,
        sort_order: plan.sort_order ?? 0,
      };
      if (plan.id) {
        const { error } = await sb.from("student_plan_catalog").update(row).eq("id", plan.id).eq("coach_id", coachId);
        if (error) throw error;
      } else {
        const { error } = await sb.from("student_plan_catalog").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-plan-catalog"] });
    },
  });
}

/** Desativa (soft-delete) um plano próprio do coach — nunca apaga histórico. */
export function useDeactivatePlan(coachId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await sb
        .from("student_plan_catalog")
        .update({ is_active: false })
        .eq("id", planId)
        .eq("coach_id", coachId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-plan-catalog"] });
    },
  });
}

/** Contratos vigentes dos alunos de um coach. */
export function useCoachSubscriptions(coachId: string | null) {
  return useQuery({
    queryKey: ["coach-student-subscriptions", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<StudentSubscription[]> => {
      if (!coachId) return [];
      const { data } = await sb
        .from("student_subscriptions")
        .select("*")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      return (data ?? []) as StudentSubscription[];
    },
  });
}

/** Contrato do próprio aluno (ou null quando ele ainda não tem plano). */
export function useMyStudentSubscription(studentId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-student-subscription", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<StudentSubscription | null> => {
      if (!studentId) return null;
      const { data } = await sb
        .from("student_subscriptions")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as StudentSubscription | null;
    },
  });
}
