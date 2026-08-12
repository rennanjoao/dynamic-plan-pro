-- ADITIVO: catálogo de planos dos ALUNOS + contrato do aluno + campos extras de cobrança.
-- Nada é renomeado/removido. Billing da plataforma (platform_billing_charges) permanece intocado.

CREATE TABLE IF NOT EXISTS public.student_plan_catalog (
  slug             text PRIMARY KEY,
  name             text NOT NULL,
  price_cents      integer NOT NULL CHECK (price_cents >= 0),
  duration_months  integer NOT NULL CHECK (duration_months > 0),
  description      text,
  benefits         text[] NOT NULL DEFAULT '{}',
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.student_plan_catalog TO authenticated;
GRANT ALL ON public.student_plan_catalog TO service_role;
ALTER TABLE public.student_plan_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan catalog readable by authenticated" ON public.student_plan_catalog;
CREATE POLICY "plan catalog readable by authenticated"
  ON public.student_plan_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "plan catalog managed by admin" ON public.student_plan_catalog;
CREATE POLICY "plan catalog managed by admin"
  ON public.student_plan_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_student_plan_catalog_updated_at ON public.student_plan_catalog;
CREATE TRIGGER update_student_plan_catalog_updated_at
  BEFORE UPDATE ON public.student_plan_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contrato/assinatura do ALUNO (preço congelado no momento da contratação)
CREATE TABLE IF NOT EXISTS public.student_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid NOT NULL,
  coach_id                uuid NOT NULL,
  plan_slug               text NOT NULL,
  plan_name               text NOT NULL,
  price_cents             integer NOT NULL CHECK (price_cents >= 0),
  cycle_months            integer NOT NULL CHECK (cycle_months > 0),
  started_on              date NOT NULL DEFAULT current_date,
  next_due_date           date,
  ends_on                 date,
  status                  text NOT NULL DEFAULT 'pending',
  current_charge_id       uuid,
  payment_method          text,
  payment_source          text,
  provider                text,
  external_transaction_id text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_subscriptions TO authenticated;
GRANT ALL ON public.student_subscriptions TO service_role;
ALTER TABLE public.student_subscriptions ENABLE ROW LEVEL SECURITY;

-- No máximo um contrato ativo por aluno
CREATE UNIQUE INDEX IF NOT EXISTS student_subscriptions_one_active
  ON public.student_subscriptions (student_id)
  WHERE status IN ('active', 'pending', 'overdue');

CREATE INDEX IF NOT EXISTS student_subscriptions_coach_idx
  ON public.student_subscriptions (coach_id);

DROP POLICY IF EXISTS "coach manages own student subscriptions" ON public.student_subscriptions;
CREATE POLICY "coach manages own student subscriptions"
  ON public.student_subscriptions FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "student reads own subscription" ON public.student_subscriptions;
CREATE POLICY "student reads own subscription"
  ON public.student_subscriptions FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP TRIGGER IF EXISTS update_student_subscriptions_updated_at ON public.student_subscriptions;
CREATE TRIGGER update_student_subscriptions_updated_at
  BEFORE UPDATE ON public.student_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campos aditivos em coach_finances (todos NULL para registros legados)
ALTER TABLE public.coach_finances
  ADD COLUMN IF NOT EXISTS subscription_id     uuid,
  ADD COLUMN IF NOT EXISTS plan_slug           text,
  ADD COLUMN IF NOT EXISTS plan_cycle_months   integer,
  ADD COLUMN IF NOT EXISTS cycle_number        integer,
  ADD COLUMN IF NOT EXISTS source              text,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS external_id         text,
  ADD COLUMN IF NOT EXISTS checkout_slug       text,
  ADD COLUMN IF NOT EXISTS card_installments   integer,
  ADD COLUMN IF NOT EXISTS receipt_url         text,
  ADD COLUMN IF NOT EXISTS amount_cents        integer;

-- Idempotência de webhook: uma transação externa não pode virar duas cobranças
CREATE UNIQUE INDEX IF NOT EXISTS coach_finances_provider_external_uniq
  ON public.coach_finances (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_finances_subscription_idx
  ON public.coach_finances (subscription_id);