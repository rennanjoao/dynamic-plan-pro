-- Pacote 6 — postura (IA + manual), fotos padronizadas e "Onde você sentiu?".
--
-- 1) checkin_photo_analysis ganha a leitura POSTURAL da IA (sugestão para o
--    coach confirmar) e a "impressão digital" das 4 fotos, para refazer a
--    análise quando a aluna troca as fotos. Leitura passa a exigir vínculo
--    ATIVO (antes bastava ter tido vínculo com a aluna).
-- 2) workout_exercise_feel: no fim de um exercício de glúteo a aluna pode
--    tocar onde sentiu mais (glúteo, posterior, coxa da frente, lombar).
--    Uma linha por sessão + exercício.

-- ─── 1) checkin_photo_analysis ──────────────────────────────────────────────
ALTER TABLE public.checkin_photo_analysis
  ADD COLUMN IF NOT EXISTS posture jsonb,
  ADD COLUMN IF NOT EXISTS posture_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS photos_fingerprint text;

DROP POLICY IF EXISTS checkin_photo_analysis_active_coach_only ON public.checkin_photo_analysis;
CREATE POLICY checkin_photo_analysis_active_coach_only ON public.checkin_photo_analysis
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.check_ins ci
      WHERE ci.id = checkin_photo_analysis.check_in_id
        AND public.is_active_coach_of(ci.student_id)
    )
  );

-- ─── 2) workout_exercise_feel ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_exercise_feel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  exercise_key text NOT NULL CHECK (char_length(exercise_key) BETWEEN 1 AND 200),
  exercise_name text NOT NULL CHECK (char_length(exercise_name) BETWEEN 1 AND 200),
  felt text NOT NULL CHECK (felt IN ('gluteo', 'posterior', 'quadriceps', 'lombar')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_exercise_feel_unique UNIQUE (session_id, exercise_key)
);
CREATE INDEX IF NOT EXISTS workout_exercise_feel_user_created
  ON public.workout_exercise_feel (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_exercise_feel TO authenticated;
GRANT ALL ON public.workout_exercise_feel TO service_role;
ALTER TABLE public.workout_exercise_feel ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workout_exercise_feel_updated_at ON public.workout_exercise_feel;
CREATE TRIGGER workout_exercise_feel_updated_at BEFORE UPDATE ON public.workout_exercise_feel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS workout_exercise_feel_select ON public.workout_exercise_feel;
CREATE POLICY workout_exercise_feel_select ON public.workout_exercise_feel FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_active_coach_of(user_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS workout_exercise_feel_insert ON public.workout_exercise_feel;
CREATE POLICY workout_exercise_feel_insert ON public.workout_exercise_feel FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS workout_exercise_feel_update ON public.workout_exercise_feel;
CREATE POLICY workout_exercise_feel_update ON public.workout_exercise_feel FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS workout_exercise_feel_delete ON public.workout_exercise_feel;
CREATE POLICY workout_exercise_feel_delete ON public.workout_exercise_feel FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Um UPDATE só pode trocar a resposta (felt), nunca a sessão, a dona ou o exercício.
CREATE OR REPLACE FUNCTION public.guard_workout_exercise_feel_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.exercise_key IS DISTINCT FROM OLD.exercise_key THEN
    RAISE EXCEPTION 'Só é permitido trocar a resposta de onde sentiu';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS workout_exercise_feel_identity ON public.workout_exercise_feel;
CREATE TRIGGER workout_exercise_feel_identity BEFORE UPDATE ON public.workout_exercise_feel
  FOR EACH ROW EXECUTE FUNCTION public.guard_workout_exercise_feel_identity();
