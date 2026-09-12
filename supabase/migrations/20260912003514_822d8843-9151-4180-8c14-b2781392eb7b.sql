DROP POLICY IF EXISTS "coach manages own student subscriptions" ON public.student_subscriptions;

CREATE POLICY "coach manages own student subscriptions"
  ON public.student_subscriptions FOR ALL TO authenticated
  USING (coach_id = auth.uid() AND coach_id <> student_id)
  WITH CHECK (coach_id = auth.uid() AND coach_id <> student_id);