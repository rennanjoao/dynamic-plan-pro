import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerProfile {
  user_id: string;
  coach_id: string;
  status: string;
  commission_rate_bp: number;
  pix_type: string | null;
  pix_key: string | null;
  pix_holder_name: string | null;
  activated_at: string;
  deactivated_at: string | null;
}

export interface PartnerCommission {
  id: string;
  student_id: string;
  partner_id: string;
  coach_id: string;
  gross_amount_cents: number;
  commission_rate_bp: number;
  commission_amount_cents: number;
  eligible: boolean;
  status: string;
  period_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface AccessCode {
  id: string;
  code: string;
  partner_id: string | null;
  coach_id: string;
  status: string;
  student_id: string | null;
  note: string | null;
  created_at: string;
  used_at: string | null;
  expires_at: string | null;
  kind: string;
  partner_commission_bp: number | null;
}

export interface PartnerReferral {
  student_name: string;
  attributed_at: string;
  stage: string;
  commission_status: string | null;
  commission_amount_cents: number | null;
}

/** Parceria da pessoa logada (existe só se ela for influenciadora). */
export function usePartnerProfile(userId: string | null) {
  return useQuery({
    queryKey: ["partner-profile", userId],
    queryFn: async (): Promise<PartnerProfile | null> => {
      if (!userId) return null;
      const { data } = await supabase
        .from("partner_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as PartnerProfile) ?? null;
    },
    enabled: !!userId,
  });
}

/** Influenciadoras de um coach (RLS já limita a coach_id = auth.uid()). */
export function useCoachPartners(coachId: string | null) {
  return useQuery({
    queryKey: ["coach-partners", coachId],
    queryFn: async (): Promise<PartnerProfile[]> => {
      if (!coachId) return [];
      const { data } = await supabase
        .from("partner_profiles")
        .select("*")
        .eq("coach_id", coachId)
        .order("activated_at", { ascending: false });
      return (data as PartnerProfile[]) ?? [];
    },
    enabled: !!coachId,
  });
}

/** Todas as parcerias (admin — RLS libera só para has_role admin). */
export function useAllPartners(enabled: boolean) {
  return useQuery({
    queryKey: ["all-partners"],
    queryFn: async (): Promise<PartnerProfile[]> => {
      const { data } = await supabase
        .from("partner_profiles")
        .select("*")
        .order("activated_at", { ascending: false });
      return (data as PartnerProfile[]) ?? [];
    },
    enabled,
  });
}

export function usePartnerCommissions(filter: { coachId?: string | null; partnerId?: string | null; all?: boolean }) {
  const { coachId, partnerId, all } = filter;
  return useQuery({
    queryKey: ["partner-commissions", coachId ?? null, partnerId ?? null, !!all],
    queryFn: async (): Promise<PartnerCommission[]> => {
      let query = supabase.from("partner_commissions").select("*").order("created_at", { ascending: false });
      if (coachId) query = query.eq("coach_id", coachId);
      if (partnerId) query = query.eq("partner_id", partnerId);
      const { data } = await query;
      return (data as PartnerCommission[]) ?? [];
    },
    enabled: !!coachId || !!partnerId || !!all,
  });
}

export function useCoachAccessCodes(coachId: string | null) {
  return useQuery({
    queryKey: ["coach-access-codes", coachId],
    queryFn: async (): Promise<AccessCode[]> => {
      if (!coachId) return [];
      const { data } = await supabase
        .from("access_codes")
        .select("*")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as AccessCode[]) ?? [];
    },
    enabled: !!coachId,
  });
}

/**
 * Indicados de uma influenciadora — visão restrita via RPC.
 * Devolve apenas nome, data e etapa; nunca dados de saúde/treino/dieta.
 */
export function usePartnerReferrals(partnerId: string | null) {
  return useQuery({
    queryKey: ["partner-referrals", partnerId],
    queryFn: async (): Promise<PartnerReferral[]> => {
      if (!partnerId) return [];
      const { data, error } = await supabase.rpc("get_partner_referrals", { p_partner_id: partnerId });
      if (error) return [];
      return (data as PartnerReferral[]) ?? [];
    },
    enabled: !!partnerId,
  });
}

/** Atribuição de origem de um aluno (usada pelo coach na confirmação de pagamento). */
export function useStudentAttribution(studentId: string | null) {
  return useQuery({
    queryKey: ["student-attribution", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data } = await supabase
        .from("partner_attributions")
        .select("student_id, partner_id, coach_id, locked, access_code, attributed_at")
        .eq("student_id", studentId)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!studentId,
  });
}
