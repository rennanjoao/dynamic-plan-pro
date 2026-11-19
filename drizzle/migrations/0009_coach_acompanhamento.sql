-- Pacote 5 — acompanhamento do coach.
--
-- 1) Postura rápida: o coach marca, em poucos toques, os desvios posturais
--    comuns vistos nas fotos de um check-in (ou da anamnese, como ponto de
--    partida). Uma linha por coach + fonte (check-in/anamnese). Substitui, no
--    dia a dia, o módulo completo de avaliação postural (posture_assessments),
--    que continua no banco mas fora da tela.
-- 2) meal_checkins: o coach com vínculo ATIVO passa a poder LER as refeições
--    marcadas pelo aluno (para mostrar "Refeições marcadas: 74%" no Resumo
--    do ciclo). Escrever continua só com o próprio aluno.

-- ─── 1) posture_quick_checks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posture_quick_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  coach_id uuid NOT NULL DEFAULT auth.uid(),
  source_kind text NOT NULL CHECK (source_kind IN ('anamnesis','checkin')),
  source_id uuid NOT NULL,
  -- Data da foto (envio do check-in/anamnese): ordena a linha do tempo.
  source_date timestamptz NOT NULL,
  -- { "<desvio>": "none" | "mild" | "marked" } — desvio ausente = não avaliado.
  findings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(findings) = 'object'),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_quick_checks_unique UNIQUE (coach_id, source_kind, source_id)
);
CREATE INDEX IF NOT EXISTS posture_quick_checks_student
  ON public.posture_quick_checks (student_id, source_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posture_quick_checks TO authenticated;
GRANT ALL ON public.posture_quick_checks TO service_role;
ALTER TABLE public.posture_quick_checks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS posture_quick_checks_updated_at ON public.posture_quick_checks;
CREATE TRIGGER posture_quick_checks_updated_at BEFORE UPDATE ON public.posture_quick_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS posture_quick_checks_select ON public.posture_quick_checks;
CREATE POLICY posture_quick_checks_select ON public.posture_quick_checks FOR SELECT TO authenticated
  USING (
    (coach_id = auth.uid() AND public.is_active_coach_of(student_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS posture_quick_checks_insert ON public.posture_quick_checks;
CREATE POLICY posture_quick_checks_insert ON public.posture_quick_checks FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    AND (public.is_active_coach_of(student_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
    AND (
      (source_kind = 'anamnesis' AND EXISTS (
        SELECT 1 FROM public.anamnesis a WHERE a.id = source_id AND a.student_id = posture_quick_checks.student_id))
      OR (source_kind = 'checkin' AND EXISTS (
        SELECT 1 FROM public.check_ins c WHERE c.id = source_id AND c.student_id = posture_quick_checks.student_id))
    )
  );

DROP POLICY IF EXISTS posture_quick_checks_update ON public.posture_quick_checks;
CREATE POLICY posture_quick_checks_update ON public.posture_quick_checks FOR UPDATE TO authenticated
  USING (
    (coach_id = auth.uid() AND public.is_active_coach_of(student_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (coach_id = auth.uid() AND public.is_active_coach_of(student_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS posture_quick_checks_delete ON public.posture_quick_checks;
CREATE POLICY posture_quick_checks_delete ON public.posture_quick_checks FOR DELETE TO authenticated
  USING (
    (coach_id = auth.uid() AND public.is_active_coach_of(student_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Um UPDATE não pode "mover" a marcação para outro aluno/fonte nem trocar o dono.
CREATE OR REPLACE FUNCTION public.guard_posture_quick_checks_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
    RAISE EXCEPTION 'Não é permitido trocar aluno, coach ou origem de uma marcação postural';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS posture_quick_checks_identity ON public.posture_quick_checks;
CREATE TRIGGER posture_quick_checks_identity BEFORE UPDATE ON public.posture_quick_checks
  FOR EACH ROW EXECUTE FUNCTION public.guard_posture_quick_checks_identity();

-- ─── 2) meal_checkins: leitura pelo coach ativo ─────────────────────────────
DROP POLICY IF EXISTS "coach reads active students meal checkins" ON public.meal_checkins;
CREATE POLICY "coach reads active students meal checkins" ON public.meal_checkins
  FOR SELECT TO authenticated
  USING (
    public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
