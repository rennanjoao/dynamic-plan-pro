-- Visão restrita dos indicados de uma influenciadora.
-- Só nome, data e etapa — nunca anamnese, medidas, fotos, dieta ou treino.
CREATE OR REPLACE FUNCTION public.get_partner_referrals(p_partner_id uuid)
RETURNS TABLE(
  student_name text,
  attributed_at timestamptz,
  stage text,
  commission_status text,
  commission_amount_cents integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR (auth.uid() <> p_partner_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(sp.full_name, pr.full_name, 'Aluno') AS student_name,
    pa.attributed_at,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_partner_referrals(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_partner_referrals(uuid) TO authenticated, service_role;