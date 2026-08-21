ALTER TABLE public.coach_finances
  ADD COLUMN IF NOT EXISTS mercado_pago_preference_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_payment_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_status text,
  ADD COLUMN IF NOT EXISTS plan_name_snapshot text;

ALTER TABLE public.student_subscriptions
  ADD COLUMN IF NOT EXISTS external_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS coach_finances_mp_payment_uniq
  ON public.coach_finances (mercado_pago_payment_id)
  WHERE mercado_pago_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_finances_mp_preference_idx
  ON public.coach_finances (mercado_pago_preference_id)
  WHERE mercado_pago_preference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coach_finances_one_pending_mp
  ON public.coach_finances (student_id)
  WHERE status = 'pending' AND provider = 'mercadopago' AND student_id IS NOT NULL;