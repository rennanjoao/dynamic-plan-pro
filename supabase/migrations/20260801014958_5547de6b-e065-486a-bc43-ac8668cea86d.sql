CREATE TABLE IF NOT EXISTS public.checkin_ai_adjustment_draft (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id   uuid        NOT NULL UNIQUE REFERENCES public.check_ins(id) ON DELETE CASCADE,
  action        text        NOT NULL DEFAULT 'nenhuma_alteracao',
  action_rationale text,
  estrategia_identificada text,
  resumo        text,
  sugestoes     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.checkin_ai_adjustment_draft TO authenticated;
GRANT ALL ON public.checkin_ai_adjustment_draft TO service_role;

ALTER TABLE public.checkin_ai_adjustment_draft ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach do aluno e admin leem checkin_ai_adjustment_draft"
  ON public.checkin_ai_adjustment_draft FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_ai_adjustment_draft.check_in_id
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

CREATE POLICY "Admin remove checkin_ai_adjustment_draft"
  ON public.checkin_ai_adjustment_draft FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));