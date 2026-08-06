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
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_coach_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized to save protocol for another coach';
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
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'protocol not found for this coach';
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