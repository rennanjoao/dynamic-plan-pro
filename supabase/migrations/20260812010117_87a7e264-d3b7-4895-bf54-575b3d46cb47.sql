CREATE TABLE IF NOT EXISTS public.coach_insights (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid        NOT NULL,
  student_id    uuid        NOT NULL UNIQUE,
  situacao      text        NOT NULL DEFAULT 'dados_insuficientes',
  confianca     text        NOT NULL DEFAULT 'baixa',
  resumo        text        NOT NULL DEFAULT '',
  observacoes   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  interpretacao text        NOT NULL DEFAULT '',
  sugestao      text,
  fontes        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_insights_coach_idx
  ON public.coach_insights (coach_id);

ALTER TABLE public.coach_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach le seus coach_insights" ON public.coach_insights;
CREATE POLICY "Coach le seus coach_insights"
  ON public.coach_insights
  FOR SELECT
  TO authenticated
  USING (auth.uid() = coach_id OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.coach_insights TO authenticated;
GRANT ALL ON public.coach_insights TO service_role;