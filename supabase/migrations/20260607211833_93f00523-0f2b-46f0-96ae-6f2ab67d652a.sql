
-- 1) performance_logs: remove public read; allow only own + coach + admin (already exist). Also allow anonymized ranking via aggregate-only column would require a view; instead restrict to authenticated and only is_anonymous rows for ranking.
DROP POLICY IF EXISTS "Public can view performance logs for ranking" ON public.performance_logs;

CREATE POLICY "Authenticated can view anonymized ranking"
ON public.performance_logs
FOR SELECT
TO authenticated
USING (is_anonymous = true);

REVOKE SELECT ON public.performance_logs FROM anon;

-- 2) coach_notifications: tighten INSERT to require active coach-student relationship and that student_id = auth.uid()
DROP POLICY IF EXISTS "Alunos podem inserir notificacoes" ON public.coach_notifications;

CREATE POLICY "Students insert notifications to their coach"
ON public.coach_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = coach_notifications.coach_id
      AND cs.student_id = auth.uid()
      AND cs.status = 'active'
  )
);

-- 3) subscriptions: remove user self-insert; only service_role manages
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.subscriptions;

-- 4) student_alert_view: recreate with security_invoker so it respects caller's RLS
DROP VIEW IF EXISTS public.student_alert_view;
CREATE VIEW public.student_alert_view
WITH (security_invoker = true) AS
SELECT sp.user_id,
  sp.full_name,
  (SELECT max(wp.completed_at) FROM workout_progress wp WHERE wp.user_id = sp.user_id AND wp.completed = true) AS last_workout_at,
  (SELECT max(dp.completed_at) FROM diet_progress dp WHERE dp.user_id = sp.user_id AND dp.completed = true) AS last_meal_at,
  CASE
    WHEN ((SELECT max(wp2.completed_at) FROM workout_progress wp2 WHERE wp2.user_id = sp.user_id AND wp2.completed = true) IS NULL)
      OR ((now() - (SELECT max(wp2.completed_at) FROM workout_progress wp2 WHERE wp2.user_id = sp.user_id AND wp2.completed = true)) > interval '3 days')
      THEN 'critical'
    WHEN (now() - (SELECT max(wp2.completed_at) FROM workout_progress wp2 WHERE wp2.user_id = sp.user_id AND wp2.completed = true)) > interval '1 day'
      THEN 'warning'
    ELSE 'ok'
  END AS alert_level
FROM public.student_profiles sp;

GRANT SELECT ON public.student_alert_view TO authenticated;

-- 5) Fix function search_path on handle_anamnesis_billing
CREATE OR REPLACE FUNCTION public.handle_anamnesis_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_coach_id UUID;
BEGIN
  SELECT coach_id INTO v_coach_id FROM coach_students WHERE student_id = NEW.student_id AND status = 'active' LIMIT 1;
  IF v_coach_id IS NOT NULL THEN
    INSERT INTO coach_finances (coach_id, student_id, description, amount, due_date, status)
    VALUES (
      v_coach_id,
      NEW.student_id,
      'Mensalidade Consultoria (Automática)',
      0,
      (NEW.submitted_at + INTERVAL '30 days')::DATE,
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 6) Revoke broad EXECUTE on SECURITY DEFINER functions exposed via API. has_role is used by RLS engine internally so we can revoke EXECUTE from anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) FROM anon;
-- keep authenticated able to call it for invite linking
GRANT EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) TO authenticated;
