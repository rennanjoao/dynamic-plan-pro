// Hooks do painel administrativo global de usuários.
// Toda leitura/escrita passa pela edge function `manage-trainers`, que valida
// auth.uid() + role admin no servidor (service_role nunca chega ao navegador).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
  is_partner: boolean;
  partner_status: string | null;
  blocked_until: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
}

export interface EligibleUser {
  id: string;
  full_name: string;
  email: string | null;
}

export interface PartnerCandidate extends EligibleUser {
  coach_id: string | null;
  is_partner: boolean;
  partner_status: string | null;
}

async function callManageTrainers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-trainers", { body });
  if (error) throw new Error(error.message);
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function useAdminUsers(params: { role: string; search: string; page: number; perPage?: number }) {
  const { role, search, page, perPage = 50 } = params;
  return useQuery({
    queryKey: ["admin-users", role, search, page, perPage],
    queryFn: () =>
      callManageTrainers<{ users: AdminUser[]; total: number }>({
        action: "list-users",
        role,
        search,
        page,
        perPage,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useEligibleUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-eligible-users"],
    queryFn: () =>
      callManageTrainers<{ coaches: EligibleUser[]; partnerCandidates: PartnerCandidate[] }>({
        action: "list-eligible",
      }),
    enabled,
  });
}

export const adminUsersApi = { call: callManageTrainers };
