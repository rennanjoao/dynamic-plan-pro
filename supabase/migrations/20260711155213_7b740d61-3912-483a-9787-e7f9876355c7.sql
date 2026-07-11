CREATE OR REPLACE FUNCTION public.classify_exercise_library_entry(
  p_exercise_key text,
  p_display_name text,
  p_primary_group text,
  p_secondary_groups text[],
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source NOT IN ('auto', 'manual', 'unclassified') THEN
    RAISE EXCEPTION 'invalid classification source: %', p_source;
  END IF;

  INSERT INTO public.exercise_library (
    exercise_key, display_name, primary_muscle_group,
    secondary_muscle_groups, classification_source, updated_at
  )
  VALUES (
    p_exercise_key, p_display_name, p_primary_group,
    COALESCE(p_secondary_groups, '{}'), p_source, now()
  )
  ON CONFLICT (exercise_key) DO UPDATE
  SET
    display_name = COALESCE(public.exercise_library.display_name, EXCLUDED.display_name),
    primary_muscle_group = CASE
      WHEN public.exercise_library.classification_source = 'manual'
           AND EXCLUDED.classification_source <> 'manual'
        THEN public.exercise_library.primary_muscle_group
      WHEN public.exercise_library.classification_source = 'auto'
           AND EXCLUDED.classification_source = 'unclassified'
        THEN public.exercise_library.primary_muscle_group
      ELSE EXCLUDED.primary_muscle_group
    END,
    secondary_muscle_groups = CASE
      WHEN public.exercise_library.classification_source = 'manual'
           AND EXCLUDED.classification_source <> 'manual'
        THEN public.exercise_library.secondary_muscle_groups
      WHEN public.exercise_library.classification_source = 'auto'
           AND EXCLUDED.classification_source = 'unclassified'
        THEN public.exercise_library.secondary_muscle_groups
      ELSE EXCLUDED.secondary_muscle_groups
    END,
    classification_source = CASE
      WHEN public.exercise_library.classification_source = 'manual'
           AND EXCLUDED.classification_source <> 'manual'
        THEN public.exercise_library.classification_source
      WHEN public.exercise_library.classification_source = 'auto'
           AND EXCLUDED.classification_source = 'unclassified'
        THEN public.exercise_library.classification_source
      ELSE EXCLUDED.classification_source
    END,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_exercise_library_entry(text, text, text, text[], text)
  TO authenticated;

ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_classification_source_valid
  CHECK (classification_source IN ('auto', 'manual', 'unclassified'));

ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_primary_muscle_group_valid
  CHECK (primary_muscle_group IS NULL OR primary_muscle_group IN (
    'peito','costas','trapezio','lombar','ombro','biceps','triceps','antebraco',
    'quadriceps','posterior_coxa','gluteo','adutores','panturrilha','abdomen'
  ));

ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_secondary_muscle_groups_valid
  CHECK (secondary_muscle_groups <@ ARRAY[
    'peito','costas','trapezio','lombar','ombro','biceps','triceps','antebraco',
    'quadriceps','posterior_coxa','gluteo','adutores','panturrilha','abdomen'
  ]::text[]);