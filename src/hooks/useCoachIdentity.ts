/**
 * useCoachIdentity — nome/CREF de quem aparece como "coach" nas telas.
 *
 * Antes o nome "Rennan Gonçalves" e o CREF dele estavam fixos no código, então
 * alunos de qualquer coach viam esse nome. Agora:
 *  - useMyCoachIdentity(): para a ÁREA DO ALUNO — o coach com vínculo ativo
 *    (RPC get_my_coach_public_info; se a migration ainda não estiver aplicada,
 *    cai em coach_students → profiles).
 *  - useOwnCoachIdentity(coachId): para o PAINEL DO COACH — o próprio perfil.
 */
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { isMissingFunctionError } from "@/lib/coachAccessStatus";

export interface CoachIdentity {
  coachId: string | null;
  /** Nome para exibir — nunca vazio ("seu treinador" quando desconhecido). */
  name: string;
  /** true quando o nome real foi encontrado. */
  known: boolean;
  cref: string | null;
  teamName: string | null;
}

export const FALLBACK_COACH_NAME = "seu treinador";

export function toCoachIdentity(row: {
  coach_id?: string | null; full_name?: string | null; team_name?: string | null; cref?: string | null;
} | null | undefined): CoachIdentity {
  const name = (row?.full_name ?? "").trim();
  return {
    coachId: row?.coach_id ?? null,
    name: name || FALLBACK_COACH_NAME,
    known: !!name,
    cref: (row?.cref ?? "").trim() || null,
    teamName: (row?.team_name ?? "").trim() || null,
  };
}

/** "Nome · CREF 000000-G/SP" (ou só o nome). */
export function coachSignature(c: Pick<CoachIdentity, "name" | "cref">): string {
  return c.cref ? `${c.name} · CREF ${c.cref.replace(/^CREF\s*/i, "")}` : c.name;
}

async function fetchMyCoach(): Promise<CoachIdentity> {
  const { data, error } = await sb.rpc("get_my_coach_public_info");
  if (!error) return toCoachIdentity(Array.isArray(data) ? data[0] : data);
  if (!isMissingFunctionError(error)) throw error;
  // Fallback enquanto a migration 0007 não estiver aplicada.
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return toCoachIdentity(null);
  const { data: link } = await sb
    .from("coach_students").select("coach_id, updated_at")
    .eq("student_id", uid).eq("status", "active")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!link?.coach_id) return toCoachIdentity(null);
  const { data: prof } = await sb
    .from("profiles").select("full_name, team_name, cref")
    .eq("user_id", link.coach_id).maybeSingle();
  return toCoachIdentity({ coach_id: link.coach_id, ...(prof ?? {}) });
}

export function useMyCoachIdentity(enabled = true) {
  const q = useQuery({
    queryKey: ["my-coach-identity"],
    queryFn: fetchMyCoach,
    enabled,
    staleTime: 30 * 60 * 1000,
  });
  return q.data ?? toCoachIdentity(null);
}

export function useOwnCoachIdentity(coachId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["own-coach-identity", coachId],
    enabled: !!coachId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await sb
        .from("profiles").select("full_name, team_name, cref")
        .eq("user_id", coachId).maybeSingle();
      return toCoachIdentity({ coach_id: coachId, ...(data ?? {}) });
    },
  });
  return q.data ?? toCoachIdentity(null);
}

/**
 * Para telas do aluno: o coach da aluna logada; no Modo Espelho
 * (?previewAs=), o próprio coach que está visualizando.
 */
export function useStudentViewCoachIdentity(): CoachIdentity {
  const [params] = useSearchParams();
  const previewAs = params.get("previewAs");
  // Id da SESSÃO (o coach), não o ?previewAs= — por isso não usa useAuthUserId.
  const [viewerId, setViewerId] = useState<string | null>(null);
  useEffect(() => {
    if (!previewAs) return;
    void supabase.auth.getSession().then(({ data }) => setViewerId(data.session?.user?.id ?? null));
  }, [previewAs]);
  const mine = useMyCoachIdentity(!previewAs);
  const own = useOwnCoachIdentity(previewAs ? viewerId : null);
  return previewAs ? own : mine;
}
