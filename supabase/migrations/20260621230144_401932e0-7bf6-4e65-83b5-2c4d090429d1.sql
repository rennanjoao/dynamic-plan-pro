DROP POLICY IF EXISTS "coach_sees_own_students" ON public.coach_students;

-- Limpa linha de teste inserida na simulação de escalada
DELETE FROM public.coach_students
WHERE coach_id = '71edfd4d-ee43-46a9-9a6a-9f419c856113'
  AND student_id = 'aa39907a-3059-45f1-947b-0b31c01f0318';