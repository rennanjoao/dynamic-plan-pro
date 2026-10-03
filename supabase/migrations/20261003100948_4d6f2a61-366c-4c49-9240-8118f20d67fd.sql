-- Histórico de carga por SEMANA da periodização (semana 1..4 → índice 0..3).
-- Antes o histórico era separado só pelo tipo (peso/técnica/resistência), então
-- as semanas 2 e 3 (ambas "técnica") misturavam as cargas. Agora cada semana
-- tem o próprio histórico.

ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS periodization_week smallint;

-- Recupera o histórico antigo: a sessão já guardava a semana (índice 0..3).
UPDATE public.workout_sets s
SET periodization_week = ws.periodization_week
FROM public.workout_sessions ws
WHERE s.session_id = ws.id
  AND s.periodization_week IS NULL
  AND ws.periodization_week IS NOT NULL;

CREATE INDEX IF NOT EXISTS workout_sets_week_history_idx
  ON public.workout_sets (user_id, exercise_key, periodization_week, executed_at DESC);