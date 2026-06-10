
-- 1) Add updated_by to workout_templates
ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- 2) Allow coaches to manage their own templates (in addition to admins)
DROP POLICY IF EXISTS "Coaches can insert own workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS "Coaches can update own workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS "Coaches can delete own workout templates" ON public.workout_templates;

CREATE POLICY "Coaches can insert own workout templates"
  ON public.workout_templates FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'coach'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Coaches can update own workout templates"
  ON public.workout_templates FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coaches can delete own workout templates"
  ON public.workout_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Versions table
CREATE TABLE IF NOT EXISTS public.workout_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  scope text NOT NULL DEFAULT 'full',
  name text NOT NULL,
  description text,
  treinos jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS workout_template_versions_template_idx
  ON public.workout_template_versions(template_id, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_template_versions TO authenticated;
GRANT ALL ON public.workout_template_versions TO service_role;

ALTER TABLE public.workout_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view template versions"
  ON public.workout_template_versions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coaches/admins can insert versions of own templates"
  ON public.workout_template_versions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_templates t
      WHERE t.id = template_id
        AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

CREATE POLICY "Admins can manage template versions"
  ON public.workout_template_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
