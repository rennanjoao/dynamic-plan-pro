ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS partner_commission_bp integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_codes_kind_check') THEN
    ALTER TABLE public.access_codes
      ADD CONSTRAINT access_codes_kind_check CHECK (kind IN ('student', 'partner'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_codes_commission_bp_check') THEN
    ALTER TABLE public.access_codes
      ADD CONSTRAINT access_codes_commission_bp_check
      CHECK (partner_commission_bp IS NULL OR (partner_commission_bp >= 0 AND partner_commission_bp <= 10000));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.resolve_access_code(text);

CREATE OR REPLACE FUNCTION public.resolve_access_code(p_code text)
RETURNS TABLE(
  id uuid,
  code text,
  partner_id uuid,
  coach_id uuid,
  status text,
  expires_at timestamp with time zone,
  kind text,
  partner_commission_bp integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ac.id, ac.code, ac.partner_id, ac.coach_id, ac.status, ac.expires_at,
         ac.kind, ac.partner_commission_bp
  FROM public.access_codes ac
  WHERE upper(trim(ac.code)) = upper(trim(p_code))
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_access_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_access_code(text) TO service_role;

-- Coach pode alterar SOMENTE a coluna commission_rate_bp das próprias influenciadoras.
-- Restrição por coluna é feita via GRANT de coluna; a linha é limitada pela policy.
GRANT UPDATE (commission_rate_bp) ON public.partner_profiles TO authenticated;

DROP POLICY IF EXISTS "Coach updates own partner commission" ON public.partner_profiles;
CREATE POLICY "Coach updates own partner commission"
ON public.partner_profiles
FOR UPDATE
TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());