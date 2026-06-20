
-- ============================================================
-- FASE 1.3 — BASELINE DAS TABELAS NÃO VERSIONADAS
-- (idempotente; só registra a estrutura real no histórico)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  full_name text,
  email text,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE TABLE IF NOT EXISTS public.anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  coach_id uuid,
  baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  body_fat numeric(4,1),
  arm_relaxed numeric,
  arm_flexed numeric,
  student_edit_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  coach_id uuid,
  current_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  coach_feedback text,
  photo_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  body_fat numeric(4,1),
  arm_relaxed numeric,
  arm_flexed numeric,
  feedback_read_at timestamptz,
  edit_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.coach_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  student_id uuid,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  email text
);

CREATE TABLE IF NOT EXISTS public.coach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  whatsapp text,
  source text,
  status text NOT NULL DEFAULT 'new',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  student_id uuid,
  student_name text NOT NULL,
  context text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.coach_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  student_id uuid NOT NULL,
  calories integer NOT NULL DEFAULT 2000,
  protein_g integer NOT NULL DEFAULT 160,
  carbs_g integer NOT NULL DEFAULT 250,
  fat_g integer NOT NULL DEFAULT 55,
  water_l numeric(3,1) NOT NULL DEFAULT 2.5,
  goal text NOT NULL DEFAULT 'manter',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  base_calories integer DEFAULT 0,
  base_protein_g integer DEFAULT 0,
  base_carbs_g integer DEFAULT 0,
  base_fat_g integer DEFAULT 0,
  diet_strategy_json jsonb DEFAULT '{}'::jsonb,
  workout_periodization_json jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT coach_plans_goal_check CHECK (goal IN ('emagrecer','manter','hipertrofia','recomposicao')),
  CONSTRAINT coach_plans_coach_id_student_id_key UNIQUE (coach_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.coach_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  feedback_interval_days integer DEFAULT 14,
  warning_days integer DEFAULT 14,
  critical_days integer DEFAULT 16,
  CONSTRAINT coach_students_coach_id_student_id_key UNIQUE (coach_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.daily_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  message text NOT NULL,
  frequency text NOT NULL DEFAULT 'once',
  target_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  diet_ok boolean NOT NULL DEFAULT false,
  workout_ok boolean NOT NULL DEFAULT false,
  water_ok boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  coach_id uuid,
  name text NOT NULL,
  is_template boolean DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Garante GRANTs (idempotente)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'access_logs','anamnesis','check_ins','coach_finances','coach_invites',
    'coach_leads','coach_notifications','coach_plans','coach_students',
    'daily_alerts','daily_logs','protocols'
  ]) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ============================================================
-- FASE 1.4 — TABELA DEDICADA DE COBRANÇA DA PLATAFORMA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_billing_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  period text NOT NULL,                    -- formato 'AAAA-MM'
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  student_count integer NOT NULL DEFAULT 0,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',  -- pending | paid | blocked
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_billing_charges_coach_period_key UNIQUE (coach_id, period),
  CONSTRAINT platform_billing_charges_status_check CHECK (status IN ('pending','paid','blocked'))
);

CREATE INDEX IF NOT EXISTS platform_billing_charges_coach_id_idx ON public.platform_billing_charges(coach_id);
CREATE INDEX IF NOT EXISTS platform_billing_charges_period_idx  ON public.platform_billing_charges(period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_billing_charges TO authenticated;
GRANT ALL ON public.platform_billing_charges TO service_role;

ALTER TABLE public.platform_billing_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode tudo em platform_billing_charges"
  ON public.platform_billing_charges;
CREATE POLICY "Admin pode tudo em platform_billing_charges"
  ON public.platform_billing_charges
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_platform_billing_charges_updated_at
  ON public.platform_billing_charges;
CREATE TRIGGER update_platform_billing_charges_updated_at
  BEFORE UPDATE ON public.platform_billing_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migra dados existentes de app_settings.coach_billing_state.paid -> charges
DO $$
DECLARE
  v_state jsonb;
  v_default_price numeric;
  v_overrides jsonb;
  v_pair record;
BEGIN
  SELECT value INTO v_state FROM public.app_settings WHERE key = 'coach_billing_state';
  IF v_state IS NULL THEN RETURN; END IF;

  v_default_price := COALESCE((v_state->>'price_per_student')::numeric, 0);
  v_overrides     := COALESCE(v_state->'overrides', '{}'::jsonb);

  FOR v_pair IN
    SELECT key AS coach_id, value::text AS period
    FROM jsonb_each_text(COALESCE(v_state->'paid', '{}'::jsonb))
  LOOP
    INSERT INTO public.platform_billing_charges
      (coach_id, period, unit_price, student_count, amount, status, paid_at)
    VALUES (
      v_pair.coach_id::uuid,
      v_pair.period,
      COALESCE((v_overrides->>v_pair.coach_id)::numeric, v_default_price),
      0,
      0,
      'paid',
      now()
    )
    ON CONFLICT (coach_id, period) DO NOTHING;
  END LOOP;
END $$;
