CREATE INDEX IF NOT EXISTS idx_workout_sets_user_exercise_history
ON public.workout_sets (user_id, exercise_key, set_number, completed, executed_at DESC)
WHERE completed = true AND skipped = false;