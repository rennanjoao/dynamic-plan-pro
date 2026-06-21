-- 1) check_ins: remover policies abertas demais
DROP POLICY IF EXISTS "coach admin read checkins" ON public.check_ins;
DROP POLICY IF EXISTS "coach admin update checkins" ON public.check_ins;
-- As policies restantes já cobrem corretamente:
--   checkins_student_select / checkins_student_insert / checkins_student_update (aluno)
--   checkins_coach_select / checkins_coach_feedback (coach via coach_students ativo)
--   checkins_admin_all (admin)
--   students manage own checkins (aluno - redundante mas inofensiva)

-- 2) coach_invites: remover leitura pública autenticada e dar leitura
--    restrita só ao próprio criador. Admin já tem ALL via "Admin full access coach_invites".
DROP POLICY IF EXISTS "Any authenticated can read invite by token" ON public.coach_invites;

CREATE POLICY "coach_invites_creator_select"
  ON public.coach_invites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- 3) coach_students: bloquear INSERT/UPDATE por qualquer usuário que não
--    seja coach/admin. A policy ALL "cs_coach_own" hoje só checa
--    auth.uid()=coach_id no USING e (por ausência de WITH CHECK em FOR ALL)
--    permite que um aluno insira uma linha onde ele mesmo é coach_id.
DROP POLICY IF EXISTS "cs_coach_own" ON public.coach_students;
DROP POLICY IF EXISTS "Coaches manage own students" ON public.coach_students;

-- SELECT: coach vê linhas onde ele é o coach
CREATE POLICY "cs_coach_select_own"
  ON public.coach_students
  FOR SELECT
  TO authenticated
  USING (auth.uid() = coach_id);

-- INSERT: apenas usuários com papel de coach, e inserindo onde coach_id = uid
CREATE POLICY "cs_coach_insert_own"
  ON public.coach_students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = coach_id
    AND public.has_role(auth.uid(), 'coach'::public.app_role)
  );

-- UPDATE: coach pode atualizar suas próprias linhas
CREATE POLICY "cs_coach_update_own"
  ON public.coach_students
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = coach_id
    AND public.has_role(auth.uid(), 'coach'::public.app_role)
  )
  WITH CHECK (
    auth.uid() = coach_id
    AND public.has_role(auth.uid(), 'coach'::public.app_role)
  );

-- DELETE: coach pode remover suas próprias linhas
CREATE POLICY "cs_coach_delete_own"
  ON public.coach_students
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = coach_id
    AND public.has_role(auth.uid(), 'coach'::public.app_role)
  );

-- Mantidas (já existem e estão corretas):
--   cs_admin_all (admin ALL)
--   cs_student_own / student_sees_own_link / Students view own coach link (aluno SELECT próprio link)
--   A criação de vínculo pelo aluno continua via edge function link-coach-student (service role bypassa RLS).