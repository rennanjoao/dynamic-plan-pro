import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { queryKeys } from "@/lib/queryKeys";

export interface FinanceRecord {
  id: string;
  student_id: string | null;
  description: string; 
  amount: number;
  status: string; // 'pending' | 'paid' | 'overdue'
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  payment_method?: string | null;
  checkout_url?: string | null;
  plan_slug?: string | null;
  subscription_id?: string | null;
  cycle_number?: number | null;
}

export function useCoachFinances(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.coachFinances(coachId),
    queryFn: async (): Promise<FinanceRecord[]> => {
      if (!coachId) return [];
      const [{ data }, { data: exempt }] = await Promise.all([
        supabase
          .from("coach_finances")
          .select("*")
          .eq("coach_id", coachId)
          .order("created_at", { ascending: false }),
        sb
          .from("coach_students")
          .select("student_id")
          .eq("coach_id", coachId)
          .eq("is_exempt", true),
      ]);
      const exemptIds = new Set(((exempt ?? []) as { student_id: string }[]).map((e) => e.student_id));
      // Alunos isentos somem de qualquer leitura financeira.
      return (data || []).filter((f) => !f.student_id || !exemptIds.has(f.student_id));
    },
    enabled: !!coachId,
  });
}
