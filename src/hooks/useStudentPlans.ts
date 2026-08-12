/**
 * useStudentPlans.ts — catálogo dos planos dos ALUNOS e contrato vigente.
 * Domínio separado do billing da plataforma (platform_billing_charges).
 */
import { useQuery } from "@tanstack/react-query";
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

export function useStudentPlanCatalog() {
  return useQuery({
    queryKey: ["student-plan-catalog"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<StudentPlan[]> => {
      const { data, error } = await sb
        .from("student_plan_catalog")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      // Fallback compatível: nunca quebra a tela se o catálogo falhar.
      if (error || !data || data.length === 0) return DEFAULT_STUDENT_PLANS;
      return data as StudentPlan[];
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
