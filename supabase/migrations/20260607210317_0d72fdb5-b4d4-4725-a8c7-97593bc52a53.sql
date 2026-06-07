
-- 1) Limpa órfãos
DELETE FROM public.anamnesis        WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.check_ins        WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.coach_leads      WHERE coach_id   IS NOT NULL AND coach_id   NOT IN (SELECT id FROM auth.users);
DELETE FROM public.coach_students   WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.coach_students   WHERE coach_id   IS NOT NULL AND coach_id   NOT IN (SELECT id FROM auth.users);
DELETE FROM public.daily_alerts     WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.diet_progress    WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
DELETE FROM public.performance_logs WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
DELETE FROM public.profiles         WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
DELETE FROM public.subscriptions    WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
DELETE FROM public.user_roles       WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
DELETE FROM public.workout_progress WHERE user_id    IS NOT NULL AND user_id    NOT IN (SELECT id FROM auth.users);
-- coach_finances: limpa só linhas com coach inexistente; student_id ficará NULL via FK
DELETE FROM public.coach_finances   WHERE coach_id   IS NOT NULL AND coach_id   NOT IN (SELECT id FROM auth.users);
UPDATE public.coach_finances SET student_id = NULL
  WHERE student_id IS NOT NULL AND student_id NOT IN (SELECT id FROM auth.users);
-- anamnesis coach_id pode ser NULL → set null se inválido
UPDATE public.anamnesis SET coach_id = NULL
  WHERE coach_id IS NOT NULL AND coach_id NOT IN (SELECT id FROM auth.users);
UPDATE public.check_ins SET coach_id = NULL
  WHERE coach_id IS NOT NULL AND coach_id NOT IN (SELECT id FROM auth.users);

-- 2) Adiciona FKs com ON DELETE CASCADE
ALTER TABLE public.anamnesis
  ADD CONSTRAINT anamnesis_student_fk FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT anamnesis_coach_fk   FOREIGN KEY (coach_id)   REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_student_fk FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT check_ins_coach_fk   FOREIGN KEY (coach_id)   REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.coach_finances
  ADD CONSTRAINT coach_finances_coach_fk   FOREIGN KEY (coach_id)   REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT coach_finances_student_fk FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.coach_leads
  ADD CONSTRAINT coach_leads_coach_fk FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.coach_students
  ADD CONSTRAINT coach_students_student_fk FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT coach_students_coach_fk   FOREIGN KEY (coach_id)   REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.daily_alerts
  ADD CONSTRAINT daily_alerts_student_fk FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.diet_progress
  ADD CONSTRAINT diet_progress_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.performance_logs
  ADD CONSTRAINT performance_logs_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.workout_progress
  ADD CONSTRAINT workout_progress_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
