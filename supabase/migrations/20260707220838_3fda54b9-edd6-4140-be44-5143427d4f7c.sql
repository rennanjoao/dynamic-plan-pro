
-- 1. Meal check-ins
CREATE TABLE IF NOT EXISTS public.meal_checkins (
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  meal_index int NOT NULL,
  checked boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, date, meal_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_checkins TO authenticated;
GRANT ALL ON public.meal_checkins TO service_role;

ALTER TABLE public.meal_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meal_checkins' AND policyname='student manages own meal checkins'
  ) THEN
    CREATE POLICY "student manages own meal checkins" ON public.meal_checkins
      FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
  END IF;
END $$;

-- 2. Check-in streak
CREATE OR REPLACE FUNCTION public.get_checkin_streak(p_student_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM (
    SELECT submitted_at,
           LAG(submitted_at) OVER (ORDER BY submitted_at DESC) AS prev
    FROM public.check_ins
    WHERE student_id = p_student_id
    ORDER BY submitted_at DESC
  ) t
  WHERE prev IS NULL OR prev - submitted_at <= INTERVAL '17 days'
$$;

-- 3. Coach reactions on check-ins
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS coach_reaction text;
