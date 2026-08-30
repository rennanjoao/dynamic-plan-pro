import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export interface Anamnesis {
  id: string;
  student_id: string;
  baseline_metrics: Record<string, number>;
  payload: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  student_id: string;
  current_metrics: Record<string, number>;
  payload: Record<string, unknown>;
  coach_feedback: string | null;
  photo_url: string | null;
  submitted_at: string;
}

export interface Protocol {
  id: string;
  student_id: string;
  title: string;
  html_content: string;
  payload?: Record<string, unknown> | null;
  draft_payload?: Record<string, unknown> | null;
  active: boolean;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export function useStudentData(explicitStudentId?: string) {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  const draftPreview = searchParams.get("draftPreview") === "1";

  const { data: sessionUserId, isLoading: sessionLoading } = useQuery({
    queryKey: ["session-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const studentId = explicitStudentId ?? previewAs ?? sessionUserId ?? null;

  const anamnesisQ = useQuery({
    queryKey: ["anamnesis", studentId],
    enabled: !!studentId,
    // Realtime (abaixo) já invalida esta query quando a linha muda no banco —
    // não precisamos forçar refetch a cada montagem/foco de janela.
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("anamnesis")
        .select("id, student_id, coach_id, baseline_metrics, payload, submitted_at, created_at, updated_at, body_fat, arm_relaxed, arm_flexed, student_edit_count")
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Anamnesis) ?? null;
    },
  });

  const checkInsQ = useQuery({
    queryKey: ["check-ins", studentId],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("check_ins")
        .select("id, student_id, coach_id, current_metrics, payload, coach_feedback, photo_url, submitted_at, created_at, updated_at, body_fat, arm_relaxed, arm_flexed, feedback_read_at, edit_count")
        .eq("student_id", studentId!)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      const rows = (data as unknown as Array<CheckIn & { updated_at?: string | null }>) ?? [];
      // Reordena pelo maior entre submitted_at e updated_at. Necessário porque
      // check-ins editados (mode "update") podem ter updated_at mais recente
      // que submitted_at em registros salvos antes da correção desse fluxo —
      // sem isso, um check-in editado recentemente pode ser tratado como
      // desatualizado em relação a outros registros mais antigos.
      rows.sort((a, b) => {
        const ta = Math.max(new Date(a.submitted_at).getTime(), new Date(a.updated_at || a.submitted_at).getTime());
        const tb = Math.max(new Date(b.submitted_at).getTime(), new Date(b.updated_at || b.submitted_at).getTime());
        return tb - ta;
      });
      return rows as unknown as CheckIn[];
    },
  });

  const protocolQ = useQuery({
    queryKey: ["protocol", studentId],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("protocols")
        .select("*")
        .eq("student_id", studentId!)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Protocol) ?? null;
    },
  });

  useEffect(() => {
    if (!studentId) return;
    const ch = sb
      .channel(`student-data-${studentId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "anamnesis", filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["anamnesis", studentId] });
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "check_ins", filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["check-ins", studentId] });
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "protocols", filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["protocol", studentId] });
        qc.invalidateQueries({ queryKey: ["diet-strategy", studentId] });
        qc.invalidateQueries({ queryKey: ["workout-plan", studentId] });
        qc.invalidateQueries({ queryKey: ["plan-macros", studentId] });
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "coach_plans", filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["diet-strategy", studentId] });
        qc.invalidateQueries({ queryKey: ["workout-plan", studentId] });
        qc.invalidateQueries({ queryKey: ["plan-macros", studentId] });
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "protocol_change_events", filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ["coach-updates", studentId] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [studentId, qc]);

  const isExplicit = !!explicitStudentId;

  return {
    studentId,
    anamnesis: anamnesisQ.data ?? null,
    checkIns: checkInsQ.data ?? [],
    protocol: protocolQ.data ?? null,
    loading:
      (!isExplicit && sessionLoading) ||
      (!!studentId && (anamnesisQ.isLoading || checkInsQ.isLoading || protocolQ.isLoading)),
    error: anamnesisQ.error || checkInsQ.error || protocolQ.error,
  };
}
