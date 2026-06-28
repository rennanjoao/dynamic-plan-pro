
-- Consolida conta da aluna Ana Carolina Mendes:
-- Antiga (email com typo 'teste.cm.br'): bb473e1a-aa59-4027-a851-5ff6172712ab
-- Atual (login real 'teste.com.br'):     4b891a52-44d6-453e-bdd5-e23bad88b276
DO $$
DECLARE
  v_old uuid := 'bb473e1a-aa59-4027-a851-5ff6172712ab';
  v_new uuid := '4b891a52-44d6-453e-bdd5-e23bad88b276';
BEGIN
  -- Tabelas com student_id
  UPDATE public.anamnesis             SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.check_ins             SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.coach_finances        SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.coach_notifications   SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.coach_plans           SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.coach_students        SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.daily_alerts          SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.daily_logs            SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.protocol_import_logs  SET student_id = v_new WHERE student_id = v_old;
  UPDATE public.protocols             SET student_id = v_new WHERE student_id = v_old;

  -- Tabelas com user_id
  UPDATE public.access_logs              SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.avatar_customization     SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.body_measurements        SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.diet_progress            SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.performance_logs         SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.shopping_sessions        SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.skinfold_measurements    SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.student_dismissed_alerts SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.student_profiles         SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.subscriptions            SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.workout_progress         SET user_id = v_new WHERE user_id = v_old;

  -- user_roles: evita conflito de unique (user_id, role)
  DELETE FROM public.user_roles WHERE user_id = v_new
    AND role IN (SELECT role FROM public.user_roles WHERE user_id = v_old);
  UPDATE public.user_roles SET user_id = v_new WHERE user_id = v_old;

  -- Profile: migra para o user_id correto e conserta o email
  DELETE FROM public.profiles WHERE user_id = v_new;
  UPDATE public.profiles
     SET user_id = v_new,
         email   = 'alunateste@teste.com.br'
   WHERE user_id = v_old;
END $$;
