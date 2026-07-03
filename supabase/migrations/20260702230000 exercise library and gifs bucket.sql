-- Cria a infraestrutura da biblioteca de GIFs de exercícios, que era referenciada
-- pelo código (useExerciseGif, ExerciseLibraryUploader, exerciseLibrary.ts) mas
-- nunca tinha sido provisionada no banco: nem a tabela `exercise_library` nem o
-- bucket de storage `exercicios-gifs` existiam, causando o erro "Bucket not found"
-- ao tentar enviar os arquivos .webp.

-- 1) Tabela que mapeia a chave normalizada do exercício (toExerciseKey) para o
--    nome do arquivo .webp dentro do bucket.
CREATE TABLE IF NOT EXISTS public.exercise_library (
  exercise_key text PRIMARY KEY,
  file_name    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado (aluno ou coach) pode ler, pois o GIF aparece
-- tanto no modo treino do aluno quanto em telas do coach.
DROP POLICY IF EXISTS "exercise_library_select_authenticated" ON public.exercise_library;
CREATE POLICY "exercise_library_select_authenticated"
  ON public.exercise_library FOR SELECT
  TO authenticated
  USING (true);

-- Somente admin gerencia a biblioteca (a tela de upload só é acessível em /admin,
-- que já exige role admin via AdminGuard).
DROP POLICY IF EXISTS "exercise_library_insert_admin" ON public.exercise_library;
CREATE POLICY "exercise_library_insert_admin"
  ON public.exercise_library FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "exercise_library_update_admin" ON public.exercise_library;
CREATE POLICY "exercise_library_update_admin"
  ON public.exercise_library FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "exercise_library_delete_admin" ON public.exercise_library;
CREATE POLICY "exercise_library_delete_admin"
  ON public.exercise_library FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.exercise_library TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.exercise_library TO authenticated;
GRANT ALL ON public.exercise_library TO service_role;


-- 2) Bucket de storage público para os .webp dos exercícios.
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercicios-gifs', 'exercicios-gifs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (o bucket já é público, mas a policy explícita cobre
-- também chamadas autenticadas via API, não só a URL pública direta).
DROP POLICY IF EXISTS "exercicios_gifs_public_read" ON storage.objects;
CREATE POLICY "exercicios_gifs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exercicios-gifs');

-- Upload/atualização somente por admin.
DROP POLICY IF EXISTS "exercicios_gifs_admin_insert" ON storage.objects;
CREATE POLICY "exercicios_gifs_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'exercicios-gifs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "exercicios_gifs_admin_update" ON storage.objects;
CREATE POLICY "exercicios_gifs_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'exercicios-gifs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'exercicios-gifs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "exercicios_gifs_admin_delete" ON storage.objects;
CREATE POLICY "exercicios_gifs_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'exercicios-gifs'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
