-- ============================================================
-- SPRINT 1 — LOGBOOK DE TREINOS
-- Adiciona workout_sessions e workout_sets sem quebrar nada.
-- workout_progress é mantida por compatibilidade retroativa.
-- ============================================================

-- ── 1. workout_sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id            uuid,
  plan_id             uuid,
  workout_key         text        NOT NULL,
  workout_label       text,
  periodization_week  integer,
  block_number        integer     NOT NULL DEFAULT 1,
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  general_feeling     smallint    CHECK (general_feeling BETWEEN 1 AND 3),
  sleep_quality       smallint    CHECK (sleep_quality BETWEEN 1 AND 3),
  notes               text,
  is_deload_week      boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ws_user_id_idx
  ON public.workout_sessions(user_id);
CREATE INDEX IF NOT EXISTS ws_started_at_idx
  ON public.workout_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ws_workout_key_idx
  ON public.workout_sessions(user_id, workout_key, started_at DESC);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aluno lê e escreve suas próprias sessões"
  ON public.workout_sessions;
CREATE POLICY "Aluno lê e escreve suas próprias sessões"
  ON public.workout_sessions FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Coach lê sessões de alunos vinculados"
  ON public.workout_sessions;
CREATE POLICY "Coach lê sessões de alunos vinculados"
  ON public.workout_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.coach_id = auth.uid()
        AND cs.student_id = workout_sessions.user_id
        AND cs.status = 'active'
    )
  );

CREATE OR REPLACE TRIGGER update_workout_sessions_updated_at
  BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE ON public.workout_sessions TO authenticated;
GRANT ALL ON public.workout_sessions TO service_role;

-- ── 2. workout_sets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_sets (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid        NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL,
  exercise_name       text        NOT NULL,
  exercise_key        text        NOT NULL,
  muscle_group        text,
  set_number          smallint    NOT NULL,
  weight_kg           numeric(6,2),
  reps                smallint,
  reps_target_min     smallint,
  reps_target_max     smallint,
  perceived_effort    smallint    CHECK (perceived_effort BETWEEN 1 AND 3),
  completed           boolean     NOT NULL DEFAULT true,
  skipped             boolean     NOT NULL DEFAULT false,
  notes               text,
  executed_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- perceived_effort: 1=Limpo(RIR 3+)  2=Pesado(RIR 1-2)  3=Falhei(RIR 0)

CREATE INDEX IF NOT EXISTS wset_user_exercise_idx
  ON public.workout_sets(user_id, exercise_key, executed_at DESC);
CREATE INDEX IF NOT EXISTS wset_session_idx
  ON public.workout_sets(session_id, set_number);
CREATE INDEX IF NOT EXISTS wset_user_recent_idx
  ON public.workout_sets(user_id, executed_at DESC);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aluno lê e escreve suas próprias séries"
  ON public.workout_sets;
CREATE POLICY "Aluno lê e escreve suas próprias séries"
  ON public.workout_sets FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Coach lê séries de alunos vinculados"
  ON public.workout_sets;
CREATE POLICY "Coach lê séries de alunos vinculados"
  ON public.workout_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.coach_id = auth.uid()
        AND cs.student_id = workout_sets.user_id
        AND cs.status = 'active'
    )
  );

GRANT SELECT, INSERT ON public.workout_sets TO authenticated;
GRANT ALL ON public.workout_sets TO service_role;

-- ── 3. Coluna session_id em workout_progress (retrocompat.) ──
ALTER TABLE public.workout_progress
  ADD COLUMN IF NOT EXISTS session_id uuid
    REFERENCES public.workout_sessions(id) ON DELETE SET NULL;

-- ── 4. coach_fatigue_alerts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_fatigue_alerts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL,
  student_id  uuid        NOT NULL,
  alert_type  text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'warning',
  context     jsonb       NOT NULL DEFAULT '{}',
  message     text        NOT NULL,
  suggestion  text,
  is_read     boolean     NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- alert_type: 'high_rpe' | 'poor_sleep' | 'stagnation' | 'low_adherence' | 'overreaching'
-- severity:   'info' | 'warning' | 'critical'

CREATE INDEX IF NOT EXISTS cfa_coach_unread_idx
  ON public.coach_fatigue_alerts(coach_id, is_read, created_at DESC)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS cfa_student_idx
  ON public.coach_fatigue_alerts(student_id, created_at DESC);

ALTER TABLE public.coach_fatigue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach gerencia seus alertas de fadiga"
  ON public.coach_fatigue_alerts;
CREATE POLICY "Coach gerencia seus alertas de fadiga"
  ON public.coach_fatigue_alerts FOR ALL TO authenticated
  USING  (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

GRANT SELECT, INSERT, UPDATE ON public.coach_fatigue_alerts TO authenticated;
GRANT ALL ON public.coach_fatigue_alerts TO service_role;
