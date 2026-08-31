CREATE TABLE IF NOT EXISTS public.mobility_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  name text NOT NULL,
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_templates TO authenticated;
GRANT ALL ON public.mobility_templates TO service_role;

ALTER TABLE public.mobility_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages own mobility templates"
  ON public.mobility_templates
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE INDEX IF NOT EXISTS mobility_templates_coach_idx
  ON public.mobility_templates (coach_id, created_at DESC);

CREATE TRIGGER update_mobility_templates_updated_at
  BEFORE UPDATE ON public.mobility_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Student can read own protocol versions"
  ON public.protocol_versions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());