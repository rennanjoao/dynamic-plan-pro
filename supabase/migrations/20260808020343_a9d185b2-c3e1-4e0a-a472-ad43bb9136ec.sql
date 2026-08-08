-- Políticas de acesso ao bucket privado student-media
-- Estrutura de caminho: <student_id>/<tipo>/<arquivo>

CREATE POLICY "student_media_owner_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'student-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'student-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "student_media_coach_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'student-media'
  AND EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = auth.uid()
      AND cs.status = 'active'
      AND cs.student_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'student-media'
  AND EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = auth.uid()
      AND cs.status = 'active'
      AND cs.student_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "student_media_admin_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'student-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'student-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);