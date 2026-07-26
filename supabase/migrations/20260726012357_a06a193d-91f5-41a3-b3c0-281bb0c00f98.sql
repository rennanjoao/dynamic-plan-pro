CREATE TABLE IF NOT EXISTS public.checkin_photo_analysis (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id  uuid        NOT NULL UNIQUE REFERENCES public.check_ins(id) ON DELETE CASCADE,
  tags         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reliability  numeric,
  generated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.checkin_photo_analysis TO authenticated;
GRANT ALL ON public.checkin_photo_analysis TO service_role;

ALTER TABLE public.checkin_photo_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach do aluno e admin leem checkin_photo_analysis"
  ON public.checkin_photo_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_photo_analysis.check_in_id
        AND (
          ci.coach_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.coach_students cs
            WHERE cs.student_id = ci.student_id AND cs.coach_id = auth.uid()
          )
        )
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin remove checkin_photo_analysis"
  ON public.checkin_photo_analysis FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));