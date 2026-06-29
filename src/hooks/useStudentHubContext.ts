import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StudentHubContext {
  full_name?: string | null;
  workout_logs?: string[] | null;
  last_session_at?: string | null;
  coach?: {
    id: string;
    full_name: string;
    pix_key?: string | null;
    pix_holder_name?: string | null;
    pix_city?: string | null;
    billing_alert_days?: number | null;
  } | null;
  pending_bill?: { amount: number; due_date: string } | null;
  protocol?: { id: string; name: string; updated_at: string } | null;
  anamnesis_meta?: {
    id: string;
    submitted_at: string | null;
    student_edit_count: number;
  } | null;
}

export function useStudentHubContext(userId: string | null) {
  return useQuery({
    queryKey: ["student-hub-context", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StudentHubContext> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc("get_student_hub_context", { p_student_id: userId });
      if (error) throw error;
      return (data ?? {}) as StudentHubContext;
    },
  });
}