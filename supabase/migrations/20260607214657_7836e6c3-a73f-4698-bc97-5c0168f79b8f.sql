CREATE OR REPLACE FUNCTION public.get_coach_by_invite_code(p_code text)
RETURNS TABLE(coach_id uuid, coach_name text, notification_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.user_id, p.full_name, p.notification_email
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE upper(trim(p.invite_code)) = upper(trim(p_code))
    AND ur.role = 'coach'::public.app_role
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) TO service_role;