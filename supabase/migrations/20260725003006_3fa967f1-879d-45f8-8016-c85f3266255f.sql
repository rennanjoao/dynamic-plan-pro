-- ============================================================================
-- [AI-OPS] Fundação de dados — Passo 1 do roadmap do Master Blueprint.
-- 100% aditivo. Nenhuma coluna/tabela existente muda de comportamento.
-- checkin_ai_insights é escrita só pela futura edge function (service_role);
-- por isso não há policy de INSERT/UPDATE para authenticated — nem coach
-- nem aluno criam esse registro manualmente.
-- ============================================================================

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS ai_feedback_draft text;

ALTER TABLE public.anamnesis
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.checkin_ai_insights (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_id  uuid        NOT NULL UNIQUE REFERENCES public.check_ins(id) ON DELETE CASCADE,
  summary      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.checkin_ai_insights TO authenticated;
GRANT ALL ON public.checkin_ai_insights TO service_role;

ALTER TABLE public.checkin_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach do aluno e admin leem checkin_ai_insights"
  ON public.checkin_ai_insights FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_ai_insights.check_in_id
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

CREATE POLICY "Admin remove checkin_ai_insights"
  ON public.checkin_ai_insights FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));