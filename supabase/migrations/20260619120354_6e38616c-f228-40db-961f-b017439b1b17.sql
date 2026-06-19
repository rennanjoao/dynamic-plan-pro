ALTER TABLE public.workout_progress
  ADD CONSTRAINT workout_progress_user_workout_unique UNIQUE (user_id, workout_id);