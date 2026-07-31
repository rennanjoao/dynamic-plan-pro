/**
 * usePlatformBilling.ts — cobrança da PLATAFORMA sobre o coach.
 *
 * Fonte: platform_billing_charges. Antes essa informação era misturada na
 * view `coach_priority_queue` (fila de alunos); agora vive só aqui e é
 * consumida pelo Perfil e pela aba Financeiro.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformCharge {
  id: string;
  period: string;
  amount: number;
  status: string; // 'pending' | 'blocked' | 'paid'
  created_at: string;
}

export function usePlatformBilling(coachId: string | null) {
  return useQuery({
    queryKey: ["platform-billing", coachId],
    enabled: !!coachId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlatformCharge[]> => {
      if (!coachId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("platform_billing_charges")
        .select("id, period, amount, status, created_at")
        .eq("coach_id", coachId)
        .neq("status", "paid")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PlatformCharge[]) ?? [];
    },
  });
}

/** 'blocked' > 'pending' > null — pior status pendente da plataforma. */
export function worstPlatformStatus(charges: PlatformCharge[] | undefined): "blocked" | "pending" | null {
  if (!charges || charges.length === 0) return null;
  if (charges.some((c) => c.status === "blocked")) return "blocked";
  return "pending";
}
