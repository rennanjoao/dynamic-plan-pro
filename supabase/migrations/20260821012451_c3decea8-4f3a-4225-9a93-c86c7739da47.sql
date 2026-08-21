CREATE OR REPLACE FUNCTION public.restore_billing_alert(p_finance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach uuid;
  v_student uuid;
BEGIN
  SELECT coach_id, student_id INTO v_coach, v_student
  FROM public.coach_finances WHERE id = p_finance_id;

  IF v_coach IS NULL OR v_coach <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_student IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.student_dismissed_alerts
   WHERE user_id = v_student AND alert_id = p_finance_id::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_billing_alert(uuid) TO authenticated;