REVOKE EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_by_invite_code(text) TO service_role;