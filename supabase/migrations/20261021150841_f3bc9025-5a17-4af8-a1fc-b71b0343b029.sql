CREATE TABLE IF NOT EXISTS public.student_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  area text NOT NULL CHECK (area IN ('treino','dieta','suplementos','evolucao','area_aluno','outros')),
  route text,
  is_app_open boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0 AND duration_seconds <= 86400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_activity_sessions_student_area_idx
  ON public.student_activity_sessions (student_id, area, ended_at DESC);
ALTER TABLE public.student_activity_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.student_activity_sessions TO authenticated;

DROP POLICY IF EXISTS "Students insert own activity" ON public.student_activity_sessions;
CREATE POLICY "Students insert own activity" ON public.student_activity_sessions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Students update own activity" ON public.student_activity_sessions;
CREATE POLICY "Students update own activity" ON public.student_activity_sessions
  FOR UPDATE TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Students read own activity" ON public.student_activity_sessions;
CREATE POLICY "Students read own activity" ON public.student_activity_sessions
  FOR SELECT TO authenticated USING (student_id = auth.uid());
DROP POLICY IF EXISTS "Coaches read linked activity" ON public.student_activity_sessions;
CREATE POLICY "Coaches read linked activity" ON public.student_activity_sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.coach_students cs WHERE cs.student_id = student_activity_sessions.student_id AND cs.coach_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE OR REPLACE FUNCTION public.get_student_engagement(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_coach uuid := auth.uid();
  v_link record;
  v_sub record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_link FROM coach_students WHERE coach_id = v_coach AND student_id = p_student_id LIMIT 1;
  IF v_link IS NULL AND NOT has_role(v_coach, 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM student_subscriptions
   WHERE student_id = p_student_id AND (v_link IS NULL OR coach_id = v_link.coach_id)
   ORDER BY (status = 'active') DESC, started_on DESC LIMIT 1;

  SELECT jsonb_build_object(
    'link_created_at', v_link.created_at,
    'first_protocol_viewed_at', (SELECT min(student_first_viewed_at) FROM protocols WHERE student_id = p_student_id AND coalesce(is_template,false) = false),
    'checkins_current_link', (SELECT count(*) FROM check_ins WHERE student_id = p_student_id AND (coach_id = v_link.coach_id OR coach_id IS NULL) AND (v_link IS NULL OR submitted_at >= v_link.created_at)),
    'checkins_total', (SELECT count(*) FROM check_ins WHERE student_id = p_student_id),
    'last_workout_at', GREATEST(
        (SELECT max(started_at) FROM workout_sessions WHERE user_id = p_student_id),
        (SELECT max(ended_at) FROM student_activity_sessions WHERE student_id = p_student_id AND area = 'treino')),
    'last_diet_at', GREATEST(
        (SELECT max(updated_at) FROM diet_progress WHERE user_id = p_student_id),
        (SELECT max(updated_at) FROM meal_checkins WHERE student_id = p_student_id),
        (SELECT max(ended_at) FROM student_activity_sessions WHERE student_id = p_student_id AND area = 'dieta')),
    'last_supplements_at', (SELECT max(ended_at) FROM student_activity_sessions WHERE student_id = p_student_id AND area = 'suplementos'),
    'plan', CASE WHEN v_sub IS NULL THEN NULL ELSE jsonb_build_object(
        'name', v_sub.plan_name, 'status', v_sub.status, 'started_on', v_sub.started_on,
        'ends_on', v_sub.ends_on, 'next_due_date', v_sub.next_due_date) END,
    'areas_30d', coalesce((SELECT jsonb_agg(a ORDER BY a.total_seconds DESC) FROM (
        SELECT area, sum(duration_seconds)::int AS total_seconds, count(*)::int AS session_count
        FROM student_activity_sessions
        WHERE student_id = p_student_id AND ended_at >= now() - interval '30 days' AND duration_seconds > 0
        GROUP BY area) a), '[]'::jsonb),
    'opens_total', (SELECT count(*) FROM student_activity_sessions WHERE student_id = p_student_id AND is_app_open),
    'opens_7d', (SELECT count(*) FROM student_activity_sessions WHERE student_id = p_student_id AND is_app_open AND started_at >= now() - interval '7 days'),
    'opens_30d', (SELECT count(*) FROM student_activity_sessions WHERE student_id = p_student_id AND is_app_open AND started_at >= now() - interval '30 days'),
    'active_days_7d', (SELECT count(DISTINCT (started_at AT TIME ZONE 'America/Sao_Paulo')::date) FROM student_activity_sessions WHERE student_id = p_student_id AND started_at >= now() - interval '7 days'),
    'active_days_30d', (SELECT count(DISTINCT (started_at AT TIME ZONE 'America/Sao_Paulo')::date) FROM student_activity_sessions WHERE student_id = p_student_id AND started_at >= now() - interval '30 days'),
    'logins_total', (SELECT count(*) FROM access_logs WHERE user_id = p_student_id),
    'tracking_since', (SELECT min(started_at) FROM student_activity_sessions WHERE student_id = p_student_id)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_engagement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_engagement(uuid) TO authenticated;