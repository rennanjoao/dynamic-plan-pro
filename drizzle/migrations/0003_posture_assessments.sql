CREATE TABLE IF NOT EXISTS public.posture_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  complaint text,
  pain_score smallint,
  pain_location text,
  pain_worse_with text,
  pain_better_with text,
  muscle_sensation text,
  relevant_history text,
  red_flags jsonb NOT NULL DEFAULT '{"tingling":false,"strength_loss":false,"radiating_pain":false,"trauma":false,"gait_change":false,"persistent_pain":false}'::jsonb,
  referral_recommended boolean NOT NULL DEFAULT false,
  static_observations jsonb NOT NULL DEFAULT '{}'::jsonb,
  functional_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  intervention text,
  post_intervention_response text,
  progression_level smallint,
  progression_criterion text,
  notes text,
  photo_paths jsonb NOT NULL DEFAULT '{"front":null,"side":null,"back":null}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_assessments_pain_score_check CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10),
  CONSTRAINT posture_assessments_progression_level_check CHECK (progression_level IS NULL OR progression_level BETWEEN 1 AND 6),
  CONSTRAINT posture_assessments_red_flags_object_check CHECK (jsonb_typeof(red_flags) = 'object'),
  CONSTRAINT posture_assessments_static_object_check CHECK (jsonb_typeof(static_observations) = 'object'),
  CONSTRAINT posture_assessments_functional_array_check CHECK (jsonb_typeof(functional_tests) = 'array'),
  CONSTRAINT posture_assessments_decision_object_check CHECK (jsonb_typeof(decision) = 'object'),
  CONSTRAINT posture_assessments_photo_paths_object_check CHECK (jsonb_typeof(photo_paths) = 'object'),
  CONSTRAINT posture_assessments_coach_student_link_check CHECK (coach_id <> student_id)
);

CREATE INDEX IF NOT EXISTS posture_assessments_student_assessed_idx ON public.posture_assessments (student_id, assessed_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS posture_assessments_coach_student_idx ON public.posture_assessments (coach_id, student_id, assessed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posture_assessments TO authenticated;
GRANT ALL ON public.posture_assessments TO service_role;

DROP TRIGGER IF EXISTS posture_assessments_updated_at ON public.posture_assessments;
CREATE TRIGGER posture_assessments_updated_at BEFORE UPDATE ON public.posture_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.posture_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posture_assessments_select ON public.posture_assessments;
CREATE POLICY posture_assessments_select ON public.posture_assessments FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = posture_assessments.student_id AND cs.status = 'active')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS posture_assessments_insert ON public.posture_assessments;
CREATE POLICY posture_assessments_insert ON public.posture_assessments FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid() AND (
      EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = posture_assessments.student_id AND cs.status = 'active')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS posture_assessments_update ON public.posture_assessments;
CREATE POLICY posture_assessments_update ON public.posture_assessments FOR UPDATE TO authenticated
  USING (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = posture_assessments.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = posture_assessments.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS posture_assessments_delete ON public.posture_assessments;
CREATE POLICY posture_assessments_delete ON public.posture_assessments FOR DELETE TO authenticated
  USING (
    (coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.coach_id = auth.uid() AND cs.student_id = posture_assessments.student_id AND cs.status = 'active'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );