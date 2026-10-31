import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { sanitizeLines, type AnnotationLine, type PhotoAnnotationRow, type PhotoPose, type PhotoSourceKind, type VisualDegree } from "@/lib/photoAnnotations";

export const photoAnnotationsKey = (studentId: string) => ["coach-photo-annotations", studentId] as const;

export function annotationKey(kind: PhotoSourceKind, sourceId: string, pose: PhotoPose) {
  return `${kind}:${sourceId}:${pose}`;
}

/** Anotações privadas do Coach para todas as fotos do aluno (RLS restringe ao Coach vinculado). */
export function usePhotoAnnotations(studentId: string) {
  return useQuery({
    queryKey: photoAnnotationsKey(studentId),
    queryFn: async () => {
      const { data: auth } = await sb.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return new Map<string, PhotoAnnotationRow>();
      const { data, error } = await sb
        .from("coach_photo_annotations")
        .select("*")
        .eq("student_id", studentId)
        .eq("coach_id", uid);
      if (error) throw error;
      const map = new Map<string, PhotoAnnotationRow>();
      for (const r of data || []) {
        map.set(annotationKey(r.source_kind, r.source_id, r.pose), { ...r, annotations: sanitizeLines(r.annotations) });
      }
      return map;
    },
    enabled: !!studentId,
  });
}

export interface SaveAnnotationInput {
  studentId: string;
  sourceKind: PhotoSourceKind;
  sourceId: string;
  pose: PhotoPose;
  annotations: AnnotationLine[];
  visualDegree: VisualDegree;
  coachNote: string;
}

export function useSavePhotoAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: SaveAnnotationInput) => {
      const { data: auth } = await sb.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");
      const { error } = await sb.from("coach_photo_annotations").upsert(
        {
          student_id: i.studentId,
          coach_id: uid,
          source_kind: i.sourceKind,
          source_id: i.sourceId,
          pose: i.pose,
          annotations: i.annotations,
          visual_degree: i.visualDegree,
          coach_note: i.coachNote.trim() ? i.coachNote.trim().slice(0, 1000) : null,
        },
        { onConflict: "coach_id,source_kind,source_id,pose" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, i) => qc.invalidateQueries({ queryKey: photoAnnotationsKey(i.studentId) }),
  });
}

export function useDeletePhotoAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await sb.from("coach_photo_annotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: photoAnnotationsKey(v.studentId) }),
  });
}
