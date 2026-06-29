
CREATE OR REPLACE FUNCTION public.get_student_hub_context(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result          JSONB := '{}'::jsonb;
  v_coach_id        UUID;
  v_last_session    TIMESTAMPTZ;
BEGIN
  -- 1. Nome do aluno
  SELECT jsonb_build_object('full_name', p.full_name)
    INTO v_result
    FROM profiles p WHERE p.user_id = p_student_id;

  IF v_result IS NULL THEN
    v_result := '{}'::jsonb;
  END IF;

  -- 2. Dados de treino: logs para streak + última sessão (workout_sessions é opcional)
  IF to_regclass('public.workout_sessions') IS NOT NULL THEN
    EXECUTE 'SELECT MAX(started_at) FROM public.workout_sessions WHERE user_id = $1'
      INTO v_last_session USING p_student_id;
  END IF;

  v_result := v_result || jsonb_build_object(
    'workout_logs', (
      SELECT COALESCE(jsonb_agg(w.completed_at ORDER BY w.completed_at DESC), '[]'::jsonb)
      FROM (
        SELECT completed_at
        FROM workout_progress
        WHERE user_id = p_student_id AND completed = true
        ORDER BY completed_at DESC
        LIMIT 60
      ) w
    ),
    'last_session_at', v_last_session
  );

  -- 3. Coach vinculado
  SELECT cs.coach_id INTO v_coach_id
    FROM coach_students cs
    WHERE cs.student_id = p_student_id AND cs.status = 'active'
    LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'coach', (
        SELECT jsonb_build_object(
          'id',                 p.user_id,
          'full_name',          p.full_name,
          'pix_key',            p.pix_key,
          'pix_holder_name',    p.pix_holder_name,
          'pix_city',           p.pix_city,
          'billing_alert_days', p.billing_alert_days
        )
        FROM profiles p WHERE p.user_id = v_coach_id
      ),
      'pending_bill', (
        SELECT jsonb_build_object('amount', cf.amount, 'due_date', cf.due_date)
        FROM coach_finances cf
        WHERE cf.student_id = p_student_id AND cf.status = 'pending'
          AND cf.due_date IS NOT NULL
        ORDER BY cf.due_date ASC LIMIT 1
      )
    );
  END IF;

  -- 4. Protocolo ativo
  v_result := v_result || jsonb_build_object(
    'protocol', (
      SELECT jsonb_build_object('id', pr.id, 'name', pr.name, 'updated_at', pr.updated_at)
      FROM protocols pr
      WHERE pr.student_id = p_student_id
        AND COALESCE(pr.is_template, false) = false
        AND pr.active = true
      ORDER BY pr.updated_at DESC LIMIT 1
    )
  );

  -- 5. Meta da anamnese
  v_result := v_result || jsonb_build_object(
    'anamnesis_meta', (
      SELECT jsonb_build_object(
        'id',                 a.id,
        'submitted_at',       a.submitted_at,
        'student_edit_count', a.student_edit_count
      )
      FROM anamnesis a WHERE a.student_id = p_student_id
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_hub_context(UUID) TO authenticated;
