import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { postureStoragePath } from "@/lib/postureSuggestionRules";
import type {
  DecisionRecord,
  FunctionalTestRecord,
  PostureAssessmentFormValues,
  ProgressionLevel,
  RedFlags,
  StaticObservations,
  ViewAngle,
} from "@/types/postureAssessment";

const BUCKET = "student-media";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PostureAssessment {
  id: string;
  student_id: string;
  coach_id: string;
  assessed_at: string;
  complaint: string | null;
  pain_score: number | null;
  pain_location: string | null;
  pain_worse_with: string | null;
  pain_better_with: string | null;
  muscle_sensation: string | null;
  relevant_history: string | null;
  red_flags: RedFlags;
  referral_recommended: boolean;
  static_observations: StaticObservations;
  functional_tests: FunctionalTestRecord[];
  decision: DecisionRecord;
  intervention: string | null;
  post_intervention_response: string | null;
  progression_level: ProgressionLevel | null;
  progression_criterion: string | null;
  notes: string | null;
  photo_paths: Record<ViewAngle, string | null>;
  created_at: string;
}

export function usePostureAssessments(studentId: string | null) {
  return useQuery({
    queryKey: queryKeys.coachPostureAssessments(studentId),
    enabled: !!studentId,
    queryFn: async (): Promise<PostureAssessment[]> => {
      const { data, error } = await supabase
        .from("posture_assessments")
        .select("*")
        .eq("student_id", studentId as string)
        .order("assessed_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PostureAssessment[];
    },
  });
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export function useSavePostureAssessment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      photos,
    }: {
      values: PostureAssessmentFormValues;
      photos: Partial<Record<ViewAngle, File>>;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const coachId = auth.user?.id;
      if (!coachId) throw new Error("Sessão expirada. Entre novamente.");

      const id = crypto.randomUUID();
      const photoPaths = { ...values.photoPaths };
      const uploaded: string[] = [];
      try {
        for (const view of Object.keys(photos) as ViewAngle[]) {
          const file = photos[view];
          if (!file) continue;
          if (!file.type.startsWith("image/")) throw new Error("Envie apenas imagens.");
          if (file.size > MAX_PHOTO_BYTES) throw new Error("Cada foto deve ter no máximo 10 MB.");
          const path = postureStoragePath(studentId, id, view, file.name);
          const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
          if (error) throw error;
          uploaded.push(path);
          photoPaths[view] = path;
        }

        const { error } = await supabase.from("posture_assessments").insert({
          id,
          student_id: studentId,
          coach_id: coachId,
          assessed_at: new Date(`${values.assessedAt}T12:00:00`).toISOString(),
          complaint: values.complaint || null,
          pain_score: values.painScore,
          pain_location: values.painLocation || null,
          pain_worse_with: values.painWorseWith || null,
          pain_better_with: values.painBetterWith || null,
          muscle_sensation: values.muscleSensation || null,
          relevant_history: values.relevantHistory || null,
          red_flags: values.redFlags as unknown as Json,
          referral_recommended: values.referralRecommended,
          static_observations: values.staticObservations as unknown as Json,
          functional_tests: values.functionalTests as unknown as Json,
          decision: values.decision as unknown as Json,
          intervention: values.intervention || null,
          post_intervention_response: values.postInterventionResponse || null,
          progression_level: values.progressionLevel,
          progression_criterion: values.progressionCriterion || null,
          notes: values.notes || null,
          photo_paths: photoPaths as unknown as Json,
        });
        if (error) throw error;
      } catch (err) {
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
        throw err;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.coachPostureAssessments(studentId) }),
  });
}

export function useDeletePostureAssessment(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: PostureAssessment) => {
      const { error } = await supabase.from("posture_assessments").delete().eq("id", a.id);
      if (error) throw error;
      const paths = Object.values(a.photo_paths ?? {}).filter((p): p is string => !!p);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.coachPostureAssessments(studentId) }),
  });
}
