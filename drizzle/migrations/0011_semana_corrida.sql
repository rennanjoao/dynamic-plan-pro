-- 0011 — Semana Corrida (treino secundário Full Body / Upper-Lower)
--
-- busy_week_plans        biblioteca do coach (só ele vê e edita)
-- busy_week_assignments  cópia do plano para cada aluna (uma por aluna), com
--                        a escolha DELA (student_on) — que ela só muda pela
--                        função set_busy_week_mode, nunca direto na tabela.
--
-- Idempotente: pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS public.busy_week_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'fullbody' CHECK (kind IN ('fullbody', 'upper_lower')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS busy_week_plans_coach ON public.busy_week_plans (coach_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.busy_week_plans TO authenticated;
GRANT ALL ON public.busy_week_plans TO service_role;
ALTER TABLE public.busy_week_plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS busy_week_plans_updated_at ON public.busy_week_plans;
CREATE TRIGGER busy_week_plans_updated_at BEFORE UPDATE ON public.busy_week_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS busy_week_plans_select ON public.busy_week_plans;
CREATE POLICY busy_week_plans_select ON public.busy_week_plans FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS busy_week_plans_insert ON public.busy_week_plans;
CREATE POLICY busy_week_plans_insert ON public.busy_week_plans FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS busy_week_plans_update ON public.busy_week_plans;
CREATE POLICY busy_week_plans_update ON public.busy_week_plans FOR UPDATE TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS busy_week_plans_delete ON public.busy_week_plans;
CREATE POLICY busy_week_plans_delete ON public.busy_week_plans FOR DELETE TO authenticated
  USING (coach_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_busy_week_plan_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'O dono do plano não pode ser trocado';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS busy_week_plans_identity ON public.busy_week_plans;
CREATE TRIGGER busy_week_plans_identity BEFORE UPDATE ON public.busy_week_plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_busy_week_plan_identity();

-- ── Cópia por aluna ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.busy_week_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  coach_id uuid NOT NULL DEFAULT auth.uid(),
  plan_id uuid REFERENCES public.busy_week_plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL DEFAULT '' CHECK (char_length(plan_name) <= 120),
  kind text NOT NULL DEFAULT 'fullbody' CHECK (kind IN ('fullbody', 'upper_lower')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  plan_synced_at timestamptz,
  customized boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  student_on boolean NOT NULL DEFAULT false,
  student_on_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS busy_week_assignments_coach ON public.busy_week_assignments (coach_id);
CREATE INDEX IF NOT EXISTS busy_week_assignments_plan ON public.busy_week_assignments (plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.busy_week_assignments TO authenticated;
GRANT ALL ON public.busy_week_assignments TO service_role;
ALTER TABLE public.busy_week_assignments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS busy_week_assignments_updated_at ON public.busy_week_assignments;
CREATE TRIGGER busy_week_assignments_updated_at BEFORE UPDATE ON public.busy_week_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A aluna lê a dela; o coach ATIVO dela lê; admin lê tudo (ex-coach não vê mais).
DROP POLICY IF EXISTS busy_week_assignments_select ON public.busy_week_assignments;
CREATE POLICY busy_week_assignments_select ON public.busy_week_assignments FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Só o coach ATIVO da aluna cria, altera ou remove (e assume a cópia de um coach anterior).
DROP POLICY IF EXISTS busy_week_assignments_insert ON public.busy_week_assignments;
CREATE POLICY busy_week_assignments_insert ON public.busy_week_assignments FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.is_active_coach_of(student_id));

DROP POLICY IF EXISTS busy_week_assignments_update ON public.busy_week_assignments;
CREATE POLICY busy_week_assignments_update ON public.busy_week_assignments FOR UPDATE TO authenticated
  USING (public.is_active_coach_of(student_id))
  WITH CHECK (coach_id = auth.uid() AND public.is_active_coach_of(student_id));

DROP POLICY IF EXISTS busy_week_assignments_delete ON public.busy_week_assignments;
CREATE POLICY busy_week_assignments_delete ON public.busy_week_assignments FOR DELETE TO authenticated
  USING (public.is_active_coach_of(student_id));

-- A aluna não pode ser trocada; desligar pelo coach também desliga a escolha dela.
CREATE OR REPLACE FUNCTION public.guard_busy_week_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'A aluna da Semana Corrida não pode ser trocada';
  END IF;
  IF NOT NEW.enabled THEN
    NEW.student_on := false;
    NEW.student_on_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS busy_week_assignments_guard ON public.busy_week_assignments;
CREATE TRIGGER busy_week_assignments_guard BEFORE INSERT OR UPDATE ON public.busy_week_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_busy_week_assignment();

-- A aluna liga/desliga a Semana Corrida (só a dela, só se o coach liberou).
CREATE OR REPLACE FUNCTION public.set_busy_week_mode(p_on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_on boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.busy_week_assignments a
     SET student_on = COALESCE(p_on, false),
         student_on_since = CASE
           WHEN COALESCE(p_on, false) AND a.student_on THEN a.student_on_since
           WHEN COALESCE(p_on, false) THEN now()
           ELSE NULL
         END
   WHERE a.student_id = v_uid
     AND a.enabled
  RETURNING a.student_on INTO v_on;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A Semana Corrida não está liberada para você' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_on;
END;
$$;
REVOKE ALL ON FUNCTION public.set_busy_week_mode(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_busy_week_mode(boolean) TO authenticated;
