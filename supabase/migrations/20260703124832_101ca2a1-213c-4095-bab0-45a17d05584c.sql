
-- Adiciona colunas ADITIVAS à exercise_library: display_name (nome legível do exercício)
-- e aliases (variações de nome que o coach pode digitar para o mesmo exercício).
-- Não toca em protocols, workout_sessions ou workout_sets.

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- Preenche display_name inicial derivando do file_name (troca "_" por espaço,
-- remove .webp e capitaliza a primeira letra). Só atualiza linhas que ainda
-- não têm display_name — não sobrescreve valores manuais que já existirem.
UPDATE public.exercise_library
SET display_name = initcap(
  replace(regexp_replace(file_name, '\.[^.]+$', ''), '_', ' ')
)
WHERE display_name IS NULL OR display_name = '';

-- Índice GIN para busca rápida em aliases (usado pelo combobox do coach).
CREATE INDEX IF NOT EXISTS exercise_library_aliases_gin
  ON public.exercise_library USING gin (aliases);
