-- 1. Comissão da parceira: substitui UPDATE amplo por RPC de coluna única
DROP POLICY IF EXISTS "Coach updates own partner commission" ON public.partner_profiles;

CREATE OR REPLACE FUNCTION public.set_partner_commission(p_partner_id uuid, p_rate_bp integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_rate_bp IS NULL OR p_rate_bp < 0 OR p_rate_bp > 10000 THEN
    RAISE EXCEPTION 'invalid_commission_rate';
  END IF;

  SELECT coach_id INTO v_coach FROM public.partner_profiles WHERE user_id = p_partner_id;
  IF v_coach IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  IF v_coach <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.partner_profiles
  SET commission_rate_bp = p_rate_bp, updated_at = now()
  WHERE user_id = p_partner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_partner_commission(uuid, integer) TO authenticated;

-- 2. Indicados: autoriza coach com vínculo e devolve o código usado
DROP FUNCTION IF EXISTS public.get_partner_referrals(uuid);

CREATE FUNCTION public.get_partner_referrals(p_partner_id uuid)
RETURNS TABLE(
  student_name text,
  attributed_at timestamp with time zone,
  access_code text,
  stage text,
  commission_status text,
  commission_amount_cents integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF auth.uid() <> p_partner_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.partner_profiles pp
       WHERE pp.user_id = p_partner_id AND pp.coach_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(sp.full_name, pr.full_name, 'Aluno') AS student_name,
    pa.attributed_at,
    pa.access_code,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.student_subscriptions ss
        WHERE ss.student_id = pa.student_id AND ss.status = 'active'
      ) THEN 'Ativo'
      WHEN EXISTS (
        SELECT 1 FROM public.anamnesis a
        WHERE a.student_id = pa.student_id AND a.submitted_at IS NOT NULL
      ) THEN 'Anamnese concluída'
      ELSE 'Cadastro criado'
    END AS stage,
    pc.status AS commission_status,
    pc.commission_amount_cents
  FROM public.partner_attributions pa
  LEFT JOIN public.student_profiles sp ON sp.user_id = pa.student_id
  LEFT JOIN public.profiles pr ON pr.user_id = pa.student_id
  LEFT JOIN public.partner_commissions pc
    ON pc.student_id = pa.student_id AND pc.eligible = true
  WHERE pa.partner_id = p_partner_id
  ORDER BY pa.attributed_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_referrals(uuid) TO authenticated;

-- 3. Revogação de código (status 'void' já previsto no CHECK) sem DELETE físico
CREATE OR REPLACE FUNCTION public.revoke_access_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT coach_id, status INTO v_coach, v_status
  FROM public.access_codes WHERE id = p_code_id;

  IF v_coach IS NULL THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_coach <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_status NOT IN ('unused', 'assigned') THEN
    RAISE EXCEPTION 'code_already_consumed';
  END IF;

  UPDATE public.access_codes SET status = 'void' WHERE id = p_code_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_access_code(uuid) TO authenticated;

-- 4. Auditoria administrativa
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_log_select_admin" ON public.admin_audit_log
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

-- 5. Memória de carga por periodização
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS periodization_key text;
ALTER TABLE public.workout_sets     ADD COLUMN IF NOT EXISTS periodization_key text;

CREATE INDEX IF NOT EXISTS workout_sets_history_idx
  ON public.workout_sets (user_id, exercise_key, periodization_key, executed_at DESC);