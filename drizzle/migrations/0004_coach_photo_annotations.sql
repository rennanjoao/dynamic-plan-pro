CREATE TABLE IF NOT EXISTS public.coach_photo_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('anamnesis','checkin')),
  source_id uuid NOT NULL,
  pose text NOT NULL CHECK (pose IN ('frente','lateral_dir','lateral_esq','costas')),
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  visual_degree text NOT NULL DEFAULT 'not_assessable' CHECK (visual_degree IN ('not_assessable','subtle','moderate','marked')),
  coach_note text CHECK (coach_note IS NULL OR char_length(coach_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_photo_annotations_unique UNIQUE (coach_id, source_kind, source_id, pose)
);
CREATE INDEX IF NOT EXISTS coach_photo_annotations_lookup ON public.coach_photo_annotations (student_id, source_kind, source_id, pose);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_photo_annotations TO authenticated;
GRANT ALL ON public.coach_photo_annotations TO service_role;
ALTER TABLE public.coach_photo_annotations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS coach_photo_annotations_updated_at ON public.coach_photo_annotations;
CREATE TRIGGER coach_photo_annotations_updated_at BEFORE UPDATE ON public.coach_photo_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY coach_photo_annotations_select ON public.coach_photo_annotations FOR SELECT TO authenticated
  USING (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = coach_photo_annotations.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY coach_photo_annotations_insert ON public.coach_photo_annotations FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid() AND (
      EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = coach_photo_annotations.student_id AND cs.status = 'active')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    ) AND (
      (source_kind = 'anamnesis' AND EXISTS (SELECT 1 FROM public.anamnesis a WHERE a.id = source_id AND a.student_id = coach_photo_annotations.student_id))
      OR (source_kind = 'checkin' AND EXISTS (SELECT 1 FROM public.check_ins c WHERE c.id = source_id AND c.student_id = coach_photo_annotations.student_id))
    )
  );
CREATE POLICY coach_photo_annotations_update ON public.coach_photo_annotations FOR UPDATE TO authenticated
  USING (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = coach_photo_annotations.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = coach_photo_annotations.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY coach_photo_annotations_delete ON public.coach_photo_annotations FOR DELETE TO authenticated
  USING (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = coach_photo_annotations.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );