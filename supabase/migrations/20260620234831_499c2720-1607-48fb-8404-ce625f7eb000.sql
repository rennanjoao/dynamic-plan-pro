CREATE TABLE IF NOT EXISTS public.student_dismissed_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);

GRANT SELECT, INSERT, DELETE ON public.student_dismissed_alerts TO authenticated;
GRANT ALL ON public.student_dismissed_alerts TO service_role;

ALTER TABLE public.student_dismissed_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own dismissed alerts"
  ON public.student_dismissed_alerts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_student_dismissed_alerts_user ON public.student_dismissed_alerts(user_id);