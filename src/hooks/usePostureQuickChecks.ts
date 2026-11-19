import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { parsePostureAi, sanitizeFindings, type PostureAiSuggestion, type PostureFindings, type PostureQuickCheck } from "@/lib/postureQuick";
import { resolveCheckinPhotos } from "@/lib/photoAnnotations";
import { functionErrorMessage } from "@/lib/functionError";

/** Um envio com fotos que pode receber marcação postural. */
export interface PostureSourceOption {
  kind: "anamnesis" | "checkin";
  id: string;
  date: string;
  photos: Record<string, string>;
  label: string;
}

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Tabela ainda não criada no banco (SQL do pacote 5 não rodou). */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message ?? "");
}

export const POSTURE_SQL_MISSING_MSG =
  "A postura rápida precisa do SQL do pacote 5 (posture_quick_checks). Rode o arquivo no SQL Editor do Lovable.";

export function usePostureQuickChecks(studentId: string | null) {
  return useQuery({
    queryKey: queryKeys.coachPostureQuick(studentId),
    enabled: !!studentId,
    retry: false,
    queryFn: async (): Promise<{ checks: PostureQuickCheck[]; missingTable: boolean }> => {
      const { data, error } = await sb
        .from("posture_quick_checks")
        .select("id, source_kind, source_id, source_date, findings, note")
        .eq("student_id", studentId)
        .order("source_date", { ascending: true });
      if (error) {
        if (isMissingTableError(error)) return { checks: [], missingTable: true };
        throw error;
      }
      const checks = ((data ?? []) as Array<Omit<PostureQuickCheck, "findings"> & { findings: unknown }>).map((r) => ({
        ...r,
        findings: sanitizeFindings(r.findings),
      }));
      return { checks, missingTable: false };
    },
  });
}

export interface SavePostureInput {
  studentId: string;
  sourceKind: "anamnesis" | "checkin";
  sourceId: string;
  sourceDate: string;
  findings: PostureFindings;
  note: string;
}

export function useSavePostureQuickCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePostureInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const coachId = auth?.user?.id;
      if (!coachId) throw new Error("Sessão expirada. Entre de novo.");
      const { error } = await sb.from("posture_quick_checks").upsert(
        {
          student_id: input.studentId,
          coach_id: coachId,
          source_kind: input.sourceKind,
          source_id: input.sourceId,
          source_date: input.sourceDate,
          findings: input.findings,
          note: input.note.trim() ? input.note.trim().slice(0, 500) : null,
        },
        { onConflict: "coach_id,source_kind,source_id" },
      );
      if (error) {
        if (isMissingTableError(error)) throw new Error(POSTURE_SQL_MISSING_MSG);
        throw new Error(error.message);
      }
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.coachPostureQuick(input.studentId) });
    },
  });
}

/** Envios com fotos (anamnese + check-ins), do mais recente para o mais antigo. */
export function usePostureSources(studentId: string | null) {
  return useQuery({
    queryKey: ["coach-posture-sources", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<PostureSourceOption[]> => {
      const [{ data: anam }, { data: cis }] = await Promise.all([
        sb.from("anamnesis").select("id, submitted_at, payload").eq("student_id", studentId)
          .order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("check_ins").select("id, submitted_at, payload, photo_url").eq("student_id", studentId)
          .order("submitted_at", { ascending: false }).limit(40),
      ]);
      const out: PostureSourceOption[] = [];
      const ciRows = (cis ?? []) as Array<{ id: string; submitted_at: string; payload: Record<string, unknown> | null; photo_url: string | null }>;
      ciRows.forEach((c, i) => {
        out.push({
          kind: "checkin",
          id: c.id,
          date: c.submitted_at,
          photos: resolveCheckinPhotos(c.payload, c.photo_url),
          label: `Check-in ${ciRows.length - i} · ${fmtShort(c.submitted_at)}`,
        });
      });
      if (anam?.id && anam.submitted_at) {
        const fotos = resolveCheckinPhotos((anam.payload ?? {}) as Record<string, unknown>, null);
        out.push({ kind: "anamnesis", id: anam.id, date: anam.submitted_at, photos: fotos, label: `Anamnese (início) · ${fmtShort(anam.submitted_at)}` });
      }
      return out;
    },
  });
}

// ─── Sugestão postural da IA (checkin_photo_analysis.posture) ────────────────

export interface PostureAiState {
  suggestion: PostureAiSuggestion | null;
  /** Coluna `posture` ainda não existe (SQL do pacote 6 não rodou). */
  unavailable: boolean;
}

/** Lê a sugestão postural da IA de um check-in (só coach ativo/admin pela RLS). */
export function usePostureAiSuggestion(checkInId: string | null) {
  return useQuery({
    queryKey: ["coach-posture-ai", checkInId],
    enabled: !!checkInId,
    retry: false,
    queryFn: async (): Promise<PostureAiState> => {
      const { data, error } = await sb
        .from("checkin_photo_analysis")
        .select("posture, posture_generated_at")
        .eq("check_in_id", checkInId)
        .maybeSingle();
      if (error) {
        // 42703 = coluna inexistente (SQL ainda não aplicado).
        if (error.code === "42703" || /posture/i.test(error.message ?? "")) return { suggestion: null, unavailable: true };
        throw error;
      }
      return {
        suggestion: data ? parsePostureAi(data.posture, data.posture_generated_at ?? null) : null,
        unavailable: false,
      };
    },
  });
}

/**
 * Pede à function photo-analysis a leitura postural deste check-in (gera só o
 * que faltar; se as fotos mudaram, refaz). Precisa das 4 fotos.
 */
export function useRequestPostureAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checkInId: string) => {
      const { data, error } = await supabase.functions.invoke("photo-analysis", {
        body: { checkInId, parts: ["postura"] },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Não foi possível gerar a sugestão agora. Tente de novo em instantes."));
      const res = (data ?? {}) as { ok?: boolean; skipped?: string; posture?: string };
      if (res.skipped === "fotos_incompletas") throw new Error("A sugestão precisa das 4 fotos (frente, dois lados e costas).");
      if (res.skipped === "fotos_inacessiveis") throw new Error("Não consegui abrir as fotos deste check-in.");
      if (res.posture === "falhou") throw new Error("A IA não devolveu uma leitura válida. Tente de novo.");
      return res;
    },
    onSuccess: (_d, checkInId) => {
      qc.invalidateQueries({ queryKey: ["coach-posture-ai", checkInId] });
    },
  });
}
