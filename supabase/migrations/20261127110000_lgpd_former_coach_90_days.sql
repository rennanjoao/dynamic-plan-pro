-- LGPD: ex-coach vê o histórico do aluno por até 90 dias depois do desligamento.
-- Antes, nessas tabelas, o vínculo em coach_students dava acesso PARA SEMPRE
-- (não olhava o status), e o coach_id gravado na linha também.
-- Regras novas (só para coach; aluno e admin não mudam):
--   * vínculo ativo                         -> acesso como hoje;
--   * vínculo encerrado há até 90 dias      -> acesso como hoje;
--   * vínculo encerrado há mais de 90 dias  -> sem acesso (nem pelo coach_id da linha);
--   * linha com coach_id e sem vínculo nenhum (legado) -> acesso como hoje.
-- Políticas que já exigiam vínculo ativo (fotos no storage, treinos) não mudam.

-- 1) Data do desligamento
ALTER TABLE public.coach_students ADD COLUMN IF NOT EXISTS ended_at timestamptz;

CREATE OR REPLACE FUNCTION public.coach_students_track_end()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    NEW.ended_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.status = 'active' THEN
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_students_track_end ON public.coach_students;
CREATE TRIGGER coach_students_track_end
  BEFORE INSERT OR UPDATE OF status ON public.coach_students
  FOR EACH ROW EXECUTE FUNCTION public.coach_students_track_end();

-- Vínculos já encerrados: a melhor data disponível é a última atualização.
UPDATE public.coach_students
   SET ended_at = updated_at
 WHERE status <> 'active' AND ended_at IS NULL;

-- 2) Funções de apoio (SECURITY DEFINER para não depender do RLS de coach_students)
CREATE OR REPLACE FUNCTION public.coach_can_see_student(_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = auth.uid()
      AND cs.student_id = _student
      AND (cs.status = 'active'
           OR COALESCE(cs.ended_at, cs.updated_at) > now() - interval '90 days')
  );
$$;

CREATE OR REPLACE FUNCTION public.coach_access_expired(_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = auth.uid()
      AND cs.student_id = _student
      AND cs.status <> 'active'
      AND COALESCE(cs.ended_at, cs.updated_at) <= now() - interval '90 days'
  );
$$;

REVOKE ALL ON FUNCTION public.coach_can_see_student(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coach_access_expired(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_can_see_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coach_access_expired(uuid) TO authenticated, service_role;

-- 3) Políticas (mesmos nomes; só a regra do coach muda)

-- anamnesis
DROP POLICY IF EXISTS "Student and assigned coach can read anamnesis" ON public.anamnesis;
CREATE POLICY "Student and assigned coach can read anamnesis" ON public.anamnesis
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Student and assigned coach can update anamnesis" ON public.anamnesis;
CREATE POLICY "Student and assigned coach can update anamnesis" ON public.anamnesis
  FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- check_ins
DROP POLICY IF EXISTS "Student and assigned coach can read check_ins" ON public.check_ins;
CREATE POLICY "Student and assigned coach can read check_ins" ON public.check_ins
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Student and assigned coach can update check_ins" ON public.check_ins;
CREATE POLICY "Student and assigned coach can update check_ins" ON public.check_ins
  FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    student_id = auth.uid()
    OR (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- Tabelas ligadas ao check-in
DROP POLICY IF EXISTS "Coach do aluno e admin leem checkin_ai_adjustment_draft" ON public.checkin_ai_adjustment_draft;
CREATE POLICY "Coach do aluno e admin leem checkin_ai_adjustment_draft" ON public.checkin_ai_adjustment_draft
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_ai_adjustment_draft.check_in_id
        AND ((ci.coach_id = auth.uid() AND NOT public.coach_access_expired(ci.student_id))
             OR public.coach_can_see_student(ci.student_id))
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Coach do aluno e admin leem checkin_ai_insights" ON public.checkin_ai_insights;
CREATE POLICY "Coach do aluno e admin leem checkin_ai_insights" ON public.checkin_ai_insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_ai_insights.check_in_id
        AND ((ci.coach_id = auth.uid() AND NOT public.coach_access_expired(ci.student_id))
             OR public.coach_can_see_student(ci.student_id))
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Coach do aluno e admin leem checkin_photo_analysis" ON public.checkin_photo_analysis;
CREATE POLICY "Coach do aluno e admin leem checkin_photo_analysis" ON public.checkin_photo_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_photo_analysis.check_in_id
        AND ((ci.coach_id = auth.uid() AND NOT public.coach_access_expired(ci.student_id))
             OR public.coach_can_see_student(ci.student_id))
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- consent_records (criada nesta mesma leva)
DROP POLICY IF EXISTS consent_select_coach ON public.consent_records;
CREATE POLICY consent_select_coach ON public.consent_records
  FOR SELECT TO authenticated
  USING (public.coach_can_see_student(user_id));

-- daily_logs
DROP POLICY IF EXISTS "Student and assigned coach can read daily_logs" ON public.daily_logs;
CREATE POLICY "Student and assigned coach can read daily_logs" ON public.daily_logs
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- prescription_profile
DROP POLICY IF EXISTS "Assigned coach and admin can read prescription profile" ON public.prescription_profile;
CREATE POLICY "Assigned coach and admin can read prescription profile" ON public.prescription_profile
  FOR SELECT TO authenticated
  USING (
    (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Assigned coach and admin can read prescription profile versions" ON public.prescription_profile_versions;
CREATE POLICY "Assigned coach and admin can read prescription profile versions" ON public.prescription_profile_versions
  FOR SELECT TO authenticated
  USING (
    (coach_id = auth.uid() AND NOT public.coach_access_expired(student_id))
    OR public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- shopping_sessions (a política original não tinha TO; mantido)
DROP POLICY IF EXISTS "Coach lê sessões dos alunos" ON public.shopping_sessions;
CREATE POLICY "Coach lê sessões dos alunos" ON public.shopping_sessions
  FOR SELECT
  USING (public.coach_can_see_student(user_id));

-- student_activity_sessions
DROP POLICY IF EXISTS "Coaches read linked activity" ON public.student_activity_sessions;
CREATE POLICY "Coaches read linked activity" ON public.student_activity_sessions
  FOR SELECT TO authenticated
  USING (
    public.coach_can_see_student(student_id)
    OR public.has_role(auth.uid(), 'admin')
  );
