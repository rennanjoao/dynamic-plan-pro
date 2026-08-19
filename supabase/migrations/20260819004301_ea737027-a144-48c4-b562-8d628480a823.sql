-- 1. Versionamento atômico dentro da RPC de salvamento
CREATE OR REPLACE FUNCTION public.save_protocol_with_plan(
  p_protocol_id uuid,
  p_student_id uuid,
  p_coach_id uuid,
  p_name text,
  p_payload jsonb,
  p_active boolean,
  p_as_draft boolean,
  p_goal text,
  p_calories integer,
  p_protein integer,
  p_carbs integer,
  p_fat integer,
  p_water numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_prev_payload jsonb;
  v_next_version integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_coach_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized to save protocol for another coach';
  END IF;

  -- Snapshot da versão publicada antes de sobrescrever — só em publicação real
  -- de protocolo existente. Fica na mesma transação do UPDATE abaixo.
  IF p_as_draft = false AND p_protocol_id IS NOT NULL THEN
    SELECT payload INTO v_prev_payload
    FROM public.protocols
    WHERE id = p_protocol_id;

    IF v_prev_payload IS NOT NULL THEN
      SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
      FROM public.protocol_versions
      WHERE protocol_id = p_protocol_id;

      INSERT INTO public.protocol_versions (protocol_id, student_id, coach_id, version, payload)
      VALUES (p_protocol_id, p_student_id, p_coach_id, v_next_version, v_prev_payload);
    END IF;
  END IF;

  IF p_protocol_id IS NULL THEN
    INSERT INTO public.protocols (student_id, coach_id, name, is_template, payload, active)
    VALUES (p_student_id, p_coach_id, p_name, false, p_payload, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.protocols
    SET name = p_name,
        payload = p_payload,
        active = p_active,
        draft_payload = CASE WHEN p_as_draft THEN draft_payload ELSE NULL END,
        updated_at = now()
    WHERE id = p_protocol_id
      AND coach_id = p_coach_id
      AND student_id = p_student_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'protocol not found for this coach and student';
    END IF;
  END IF;

  IF NOT p_as_draft THEN
    INSERT INTO public.coach_plans (
      coach_id, student_id, diet_strategy_json, workout_periodization_json,
      base_calories, base_protein_g, base_carbs_g, base_fat_g,
      calories, protein_g, carbs_g, fat_g, water_l, goal, updated_at
    )
    VALUES (
      p_coach_id, p_student_id, p_payload, p_payload,
      p_calories, p_protein, p_carbs, p_fat,
      p_calories, p_protein, p_carbs, p_fat, p_water, p_goal, now()
    )
    ON CONFLICT (coach_id, student_id) DO UPDATE
    SET diet_strategy_json = EXCLUDED.diet_strategy_json,
        workout_periodization_json = EXCLUDED.workout_periodization_json,
        base_calories = EXCLUDED.base_calories,
        base_protein_g = EXCLUDED.base_protein_g,
        base_carbs_g = EXCLUDED.base_carbs_g,
        base_fat_g = EXCLUDED.base_fat_g,
        calories = EXCLUDED.calories,
        protein_g = EXCLUDED.protein_g,
        carbs_g = EXCLUDED.carbs_g,
        fat_g = EXCLUDED.fat_g,
        water_l = EXCLUDED.water_l,
        goal = EXCLUDED.goal,
        updated_at = now();
  END IF;

  RETURN v_id;
END;
$function$;

-- 2. classify_exercise_library_entry: exige papel coach ou admin
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
  IF NOT (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized to classify exercise library entries';
  END IF;

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

-- 3. exercise_library.movement_pattern
ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS movement_pattern text NULL;

ALTER TABLE public.exercise_library
  DROP CONSTRAINT IF EXISTS exercise_library_movement_pattern_valid;

ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_movement_pattern_valid
  CHECK (movement_pattern IS NULL OR movement_pattern IN (
    'agachamento','dobradica_quadril','impulso','abducao','outro'
  ));

-- 4. prescription_profile
CREATE TABLE IF NOT EXISTS public.prescription_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id),
  coach_id uuid NOT NULL REFERENCES auth.users(id),
  muscle_priorities jsonb NOT NULL DEFAULT '{}'::jsonb,
  dominances text[] NOT NULL DEFAULT '{}',
  limitations text NULL,
  visual_observations text NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);

ALTER TABLE public.prescription_profile
  DROP CONSTRAINT IF EXISTS prescription_profile_dominances_valid;
ALTER TABLE public.prescription_profile
  ADD CONSTRAINT prescription_profile_dominances_valid
  CHECK (dominances <@ ARRAY['quadriceps_dominant','hamstring_dominant','glute_dominant']::text[]);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_profile TO authenticated;
GRANT ALL ON public.prescription_profile TO service_role;

ALTER TABLE public.prescription_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assigned coach and admin can read prescription profile"
  ON public.prescription_profile FOR SELECT
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = prescription_profile.student_id AND cs.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coach and admin can insert prescription profile"
  ON public.prescription_profile FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coach and admin can update prescription profile"
  ON public.prescription_profile FOR UPDATE
  TO authenticated
  USING (
    coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin can delete prescription profile"
  ON public.prescription_profile FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_prescription_profile_updated_at
  BEFORE UPDATE ON public.prescription_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();