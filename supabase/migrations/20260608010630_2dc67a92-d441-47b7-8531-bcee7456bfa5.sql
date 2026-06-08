
CREATE TABLE IF NOT EXISTS public.meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mixed',
  meal_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.meal_templates TO authenticated;
GRANT ALL ON public.meal_templates TO service_role;

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches view own meal templates"
  ON public.meal_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches insert own meal templates"
  ON public.meal_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches delete own meal templates"
  ON public.meal_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = coach_id);

ALTER TABLE public.anamnesis
  ADD COLUMN IF NOT EXISTS body_fat NUMERIC(4,1);

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS body_fat NUMERIC(4,1);

CREATE INDEX IF NOT EXISTS idx_check_ins_student_submitted
  ON public.check_ins (student_id, submitted_at DESC);
