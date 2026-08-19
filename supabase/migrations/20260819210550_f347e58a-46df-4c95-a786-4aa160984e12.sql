ALTER TABLE public.student_plan_catalog
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.student_plan_catalog SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE public.student_plan_catalog ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.student_plan_catalog DROP CONSTRAINT IF EXISTS student_plan_catalog_pkey;
ALTER TABLE public.student_plan_catalog ADD CONSTRAINT student_plan_catalog_pkey PRIMARY KEY (id);

ALTER TABLE public.student_plan_catalog
  ADD COLUMN IF NOT EXISTS coach_id uuid NULL REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_student_plan_catalog_coach_id
  ON public.student_plan_catalog(coach_id);

DROP INDEX IF EXISTS student_plan_catalog_coach_slug_key;
CREATE UNIQUE INDEX student_plan_catalog_coach_slug_key
  ON public.student_plan_catalog (coach_id, slug);

DROP POLICY IF EXISTS "plan catalog managed by admin" ON public.student_plan_catalog;
DROP POLICY IF EXISTS "coach manages own plans, admin manages all" ON public.student_plan_catalog;
CREATE POLICY "coach manages own plans, admin manages all"
  ON public.student_plan_catalog FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_plan_catalog TO authenticated;
GRANT ALL ON public.student_plan_catalog TO service_role;