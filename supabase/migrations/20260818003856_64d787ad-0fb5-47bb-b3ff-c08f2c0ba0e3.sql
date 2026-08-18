-- ─────────────────────────────────────────────────────────────
-- Sistema de Parcerias com Influenciadoras — Fase 1 (schema/RLS)
-- Padrão seguido: referrals (escrita só via edge function service_role)
-- ─────────────────────────────────────────────────────────────

-- 1) partner_profiles ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  commission_rate_bp integer NOT NULL DEFAULT 1000 CHECK (commission_rate_bp >= 0 AND commission_rate_bp <= 10000),
  pix_type text CHECK (pix_type IN ('cpf','cnpj','email','phone','random')),
  pix_key text,
  pix_holder_name text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  activated_by_admin uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_profiles TO authenticated;
GRANT ALL ON public.partner_profiles TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.partner_profiles FROM authenticated, anon;
ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_profiles_select_admin ON public.partner_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY partner_profiles_select_coach ON public.partner_profiles
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY partner_profiles_select_self ON public.partner_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_partner_profiles_coach ON public.partner_profiles (coach_id);

CREATE TRIGGER update_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) access_codes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  partner_id uuid REFERENCES public.partner_profiles(user_id) ON DELETE SET NULL,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','assigned','activated','expired','void')),
  student_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz
);

GRANT SELECT ON public.access_codes TO authenticated;
GRANT ALL ON public.access_codes TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.access_codes FROM authenticated, anon;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_codes_select_admin ON public.access_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY access_codes_select_coach ON public.access_codes
  FOR SELECT TO authenticated USING (coach_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_access_codes_coach ON public.access_codes (coach_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_partner ON public.access_codes (partner_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_status ON public.access_codes (status);

-- 3) partner_attributions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_attributions (
  student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_profiles(user_id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_code text,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  attributed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.partner_attributions TO authenticated;
GRANT ALL ON public.partner_attributions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.partner_attributions FROM authenticated, anon;
ALTER TABLE public.partner_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_attributions_select_admin ON public.partner_attributions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY partner_attributions_select_coach ON public.partner_attributions
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY partner_attributions_select_partner ON public.partner_attributions
  FOR SELECT TO authenticated USING (partner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_partner_attributions_partner ON public.partner_attributions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_attributions_coach ON public.partner_attributions (coach_id);

-- 4) commission_periods (antes de partner_commissions por causa da FK) ──
CREATE TABLE IF NOT EXISTS public.commission_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_profiles(user_id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount_cents integer NOT NULL DEFAULT 0,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_periods_unique UNIQUE (coach_id, partner_id, period_start, period_end)
);

GRANT SELECT ON public.commission_periods TO authenticated;
GRANT ALL ON public.commission_periods TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.commission_periods FROM authenticated, anon;
ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_periods_select_admin ON public.commission_periods
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY commission_periods_select_coach ON public.commission_periods
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY commission_periods_select_partner ON public.commission_periods
  FOR SELECT TO authenticated USING (partner_id = auth.uid());

-- 5) partner_commissions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_profiles(user_id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.student_subscriptions(id) ON DELETE SET NULL,
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents >= 0),
  commission_rate_bp integer NOT NULL CHECK (commission_rate_bp >= 0 AND commission_rate_bp <= 10000),
  commission_amount_cents integer NOT NULL CHECK (commission_amount_cents >= 0),
  eligible boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','paid','canceled')),
  period_id uuid REFERENCES public.commission_periods(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

-- Trava física da regra "comissão só na primeira ativação"
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commissions_one_per_student
  ON public.partner_commissions (student_id) WHERE eligible = true;

GRANT SELECT ON public.partner_commissions TO authenticated;
GRANT ALL ON public.partner_commissions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.partner_commissions FROM authenticated, anon;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_commissions_select_admin ON public.partner_commissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY partner_commissions_select_coach ON public.partner_commissions
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY partner_commissions_select_partner ON public.partner_commissions
  FOR SELECT TO authenticated USING (partner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_coach ON public.partner_commissions (coach_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_period ON public.partner_commissions (period_id);

-- 6) Anamnese: origem autodeclarada (pesquisa de marketing) ────
ALTER TABLE public.anamnesis
  ADD COLUMN IF NOT EXISTS self_reported_source text;

-- 7) Resolução de código — só service_role (nunca client) ──────
CREATE OR REPLACE FUNCTION public.resolve_access_code(p_code text)
RETURNS TABLE(id uuid, code text, partner_id uuid, coach_id uuid, status text, expires_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ac.id, ac.code, ac.partner_id, ac.coach_id, ac.status, ac.expires_at
  FROM public.access_codes ac
  WHERE upper(trim(ac.code)) = upper(trim(p_code))
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_access_code(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_access_code(text) TO service_role;

-- 8) Derivação do coach de uma influenciadora (vínculo já existente) ──
CREATE OR REPLACE FUNCTION public.derive_partner_coach(p_partner_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cs.coach_id
  FROM public.coach_students cs
  WHERE cs.student_id = p_partner_id AND cs.status = 'active'
  ORDER BY cs.created_at ASC
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.derive_partner_coach(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.derive_partner_coach(uuid) TO authenticated, service_role;