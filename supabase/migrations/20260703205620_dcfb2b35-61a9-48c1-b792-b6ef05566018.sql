DELETE FROM public.workout_sets a
USING public.workout_sets b
WHERE a.session_id    = b.session_id
  AND a.exercise_key  = b.exercise_key
  AND a.set_number    = b.set_number
  AND a.created_at    < b.created_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_sets_session_exkey_setnum_uniq'
  ) THEN
    ALTER TABLE public.workout_sets
      ADD CONSTRAINT workout_sets_session_exkey_setnum_uniq
      UNIQUE (session_id, exercise_key, set_number);
  END IF;
END $$;