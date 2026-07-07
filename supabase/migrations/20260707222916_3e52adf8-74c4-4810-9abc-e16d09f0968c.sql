
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_general_feeling_check;
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_sleep_quality_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_general_feeling_check CHECK (general_feeling IS NULL OR (general_feeling BETWEEN 1 AND 4));
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_sleep_quality_check CHECK (sleep_quality IS NULL OR (sleep_quality BETWEEN 1 AND 4));
