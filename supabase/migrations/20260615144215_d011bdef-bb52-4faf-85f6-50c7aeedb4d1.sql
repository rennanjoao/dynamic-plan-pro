ALTER TABLE public.coach_students
  ADD COLUMN IF NOT EXISTS feedback_interval_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS warning_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS critical_days integer DEFAULT 16;