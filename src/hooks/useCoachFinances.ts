import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FinanceRecord {
  id: string;
  student_id: string | null;
  description: string; 
  amount: number;
  status: string; // 'pending' | 'paid' | 'overdue'
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

export function useCoachFinances(coachId: string | null) {
  return useQuery({
    queryKey: ["coach-finances", coachId],
    queryFn: async (): Promise<FinanceRecord[]> => {
      if (!coachId) return [];
      const { data } = await supabase
        .from("coach_finances")
        .select("*")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!coachId,
  });
}
