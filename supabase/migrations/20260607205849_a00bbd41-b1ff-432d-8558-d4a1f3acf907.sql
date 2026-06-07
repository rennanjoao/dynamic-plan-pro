
-- 1) Trial em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Preenche trial para coaches existentes que ainda não têm
UPDATE public.profiles p
SET trial_ends_at = COALESCE(p.trial_ends_at, p.created_at + INTERVAL '30 days')
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id AND ur.role = 'coach'
);

-- 2) app_settings (key/value JSON)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL    ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_read_auth"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "app_settings_admin_write"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed da chave dos planos externos
INSERT INTO public.app_settings (key, value)
VALUES ('coach_plans', jsonb_build_object(
  'external_url', '',
  'monthly_price',   'R$ 20,00',
  'semester_price',  'R$ 108,00',
  'annual_price',    'R$ 192,00'
))
ON CONFLICT (key) DO NOTHING;
