-- ============================================================================
-- [FIX] app_role enum is missing 'coach'
-- Confirmed by grep: multiple migrations and edge functions cast
-- 'coach'::public.app_role (e.g. has_role(auth.uid(), 'coach'::public.app_role)),
-- but the enum created in 20251119001553 only defines ('admin', 'user').
-- This only works today because the enum was altered live on the running
-- database outside of version control. Without this fix, restoring the DB
-- from these migrations from scratch breaks every coach permission check.
-- Must run as its own statement (a value added to an enum cannot be used
-- inside the same transaction it was added in) — this migration does not
-- reference 'coach'::app_role anywhere below, so that's safe here.
-- ============================================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';

-- ============================================================================
-- [FIX] 9 tables with zero RLS coverage (confirmed: no ENABLE ROW LEVEL
-- SECURITY / CREATE POLICY for any of them in any migration):
--   anamnesis, check_ins, protocols, coach_plans, coach_finances,
--   daily_alerts, daily_logs, coach_leads, access_logs
--
-- Policies below mirror the access patterns already used by the app code
-- (verified against src/ call sites) rather than inventing new ones:
--   - anamnesis / check_ins: student owns their row; the assigned coach
--     (coach_id, or linked via coach_students once assigned) edits it
--     directly with their own session (MeasurementsEditor.tsx,
--     CheckinFullEditor.tsx) — no service-role/edge-function indirection.
--   - protocols / coach_plans: coach authors these, student reads their own.
--   - coach_finances: coach-only business data; students never read it.
--   - daily_alerts: written by the trainer (trainer_id), read by the student.
--   - daily_logs / coach_leads: not currently wired into the client, but
--     given owner columns, standard owner+admin defaults are applied so a
--     future feature isn't silently exposed to every authenticated user.
--   - access_logs: login audit trail; each user can insert/see their own
--     entry (Auth.tsx), admins can see all.
-- ============================================================================

-- ── anamnesis ───────────────────────────────────────────────────────────────
ALTER TABLE public.anamnesis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student and assigned coach can read anamnesis"
  ON public.anamnesis FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = anamnesis.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Student can insert own anamnesis"
  ON public.anamnesis FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Student and assigned coach can update anamnesis"
  ON public.anamnesis FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = anamnesis.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = anamnesis.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin can delete anamnesis"
  ON public.anamnesis FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── check_ins ───────────────────────────────────────────────────────────────
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student and assigned coach can read check_ins"
  ON public.check_ins FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = check_ins.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Student can insert own check_ins"
  ON public.check_ins FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Student and assigned coach can update check_ins"
  ON public.check_ins FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = check_ins.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    student_id = auth.uid()
    OR coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = check_ins.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin can delete check_ins"
  ON public.check_ins FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── protocols ────────────────────────────────────────────────────────────────
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can read protocols"
  ON public.protocols FOR SELECT
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coach can insert own protocols"
  ON public.protocols FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can update own protocols"
  ON public.protocols FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach can delete own protocols"
  ON public.protocols FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── coach_plans ──────────────────────────────────────────────────────────────
ALTER TABLE public.coach_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can read coach_plans"
  ON public.coach_plans FOR SELECT
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coach can insert own coach_plans"
  ON public.coach_plans FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can update own coach_plans"
  ON public.coach_plans FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach can delete own coach_plans"
  ON public.coach_plans FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── coach_finances ───────────────────────────────────────────────────────────
-- Private business data: students are never a party to these policies.
ALTER TABLE public.coach_finances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage own coach_finances"
  ON public.coach_finances FOR ALL
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── daily_alerts ─────────────────────────────────────────────────────────────
ALTER TABLE public.daily_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student and trainer can read daily_alerts"
  ON public.daily_alerts FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR trainer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Trainer can manage own daily_alerts"
  ON public.daily_alerts FOR ALL
  TO authenticated
  USING (trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (trainer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── daily_logs ───────────────────────────────────────────────────────────────
-- Not yet wired into the client, but locking to owner+admin now so it can't
-- default to "any authenticated user" the moment a feature starts using it.
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student and assigned coach can read daily_logs"
  ON public.daily_logs FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = daily_logs.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Student can manage own daily_logs"
  ON public.daily_logs FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Student can update own daily_logs"
  ON public.daily_logs FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete daily_logs"
  ON public.daily_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── coach_leads ──────────────────────────────────────────────────────────────
ALTER TABLE public.coach_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage own coach_leads"
  ON public.coach_leads FOR ALL
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ── access_logs ──────────────────────────────────────────────────────────────
-- Login audit trail (written from Auth.tsx on each sign-in). Users may see
-- and record their own entries; only admins can see everyone's.
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can read own access_logs"
  ON public.access_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User can insert own access_logs"
  ON public.access_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin can delete access_logs"
  ON public.access_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
