ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.protocol_versions
  ADD COLUMN IF NOT EXISTS revision integer,
  ADD COLUMN IF NOT EXISTS changed_by uuid,
  ADD COLUMN IF NOT EXISTS protocol_name text,
  ADD COLUMN IF NOT EXISTS active boolean;

CREATE TABLE IF NOT EXISTS public.protocol_drafts (
  protocol_id uuid PRIMARY KEY REFERENCES public.protocols(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  student_id uuid NOT NULL,
  payload jsonb NOT NULL,
  base_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_drafts TO authenticated;
GRANT ALL ON public.protocol_drafts TO service_role;

ALTER TABLE public.protocol_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach manages private protocol drafts" ON public.protocol_drafts;
CREATE POLICY "Coach manages private protocol drafts"
  ON public.protocol_drafts FOR ALL TO authenticated
  USING (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS protocol_drafts_coach_student_idx
  ON public.protocol_drafts(coach_id, student_id);

DROP TRIGGER IF EXISTS update_protocol_drafts_updated_at ON public.protocol_drafts;
CREATE TRIGGER update_protocol_drafts_updated_at
  BEFORE UPDATE ON public.protocol_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.save_protocol_with_plan(uuid, uuid, uuid, text, jsonb, boolean, boolean, text, integer, integer, integer, integer, numeric);

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
  p_water numeric,
  p_expected_revision integer DEFAULT NULL
)
RETURNS TABLE(protocol_id uuid, revision integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_protocol public.protocols%ROWTYPE;
  v_id uuid;
  v_revision integer;
  v_next_version integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_actor <> p_coach_id
     AND NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized to save protocol for another coach' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.coach_students cs
       WHERE cs.coach_id = p_coach_id
         AND cs.student_id = p_student_id
         AND cs.status = 'active'
     ) THEN
    RAISE EXCEPTION 'student is not assigned to this coach' USING ERRCODE = '42501';
  END IF;

  IF p_protocol_id IS NULL THEN
    IF p_as_draft THEN
      RAISE EXCEPTION 'new protocol must be published before server draft autosave';
    END IF;

    INSERT INTO public.protocols (
      student_id, coach_id, name, is_template, payload, active, revision, draft_payload
    ) VALUES (
      p_student_id, p_coach_id, p_name, false, p_payload, p_active, 1, NULL
    ) RETURNING id, protocols.revision INTO v_id, v_revision;
  ELSE
    SELECT * INTO v_protocol
    FROM public.protocols
    WHERE id = p_protocol_id
      AND coach_id = p_coach_id
      AND student_id = p_student_id
      AND is_template = false
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'protocol not found for this coach and student' USING ERRCODE = 'P0002';
    END IF;

    IF p_expected_revision IS NOT NULL
       AND v_protocol.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'protocol revision conflict: expected %, current %', p_expected_revision, v_protocol.revision
        USING ERRCODE = '40001';
    END IF;

    v_id := v_protocol.id;

    IF p_as_draft THEN
      INSERT INTO public.protocol_drafts (
        protocol_id, coach_id, student_id, payload, base_revision
      ) VALUES (
        v_id, p_coach_id, p_student_id, p_payload, v_protocol.revision
      )
      ON CONFLICT (protocol_id) DO UPDATE
      SET payload = EXCLUDED.payload,
          base_revision = EXCLUDED.base_revision,
          coach_id = EXCLUDED.coach_id,
          student_id = EXCLUDED.student_id,
          updated_at = now();
      v_revision := v_protocol.revision;
      RETURN QUERY SELECT v_id, v_revision;
      RETURN;
    END IF;

    SELECT COALESCE(MAX(pv.version), 0) + 1 INTO v_next_version
    FROM public.protocol_versions pv
    WHERE pv.protocol_id = v_id;

    INSERT INTO public.protocol_versions (
      protocol_id, student_id, coach_id, version, payload,
      revision, changed_by, protocol_name, active
    ) VALUES (
      v_id, v_protocol.student_id, v_protocol.coach_id, v_next_version,
      v_protocol.payload, v_protocol.revision, v_actor, v_protocol.name, v_protocol.active
    );

    UPDATE public.protocols p
    SET name = p_name,
        payload = p_payload,
        active = p_active,
        revision = p.revision + 1,
        draft_payload = NULL,
        updated_at = now()
    WHERE p.id = v_id
    RETURNING p.revision INTO v_revision;

    DELETE FROM public.protocol_drafts d WHERE d.protocol_id = v_id;
  END IF;

  INSERT INTO public.coach_plans (
    coach_id, student_id, diet_strategy_json, workout_periodization_json,
    base_calories, base_protein_g, base_carbs_g, base_fat_g,
    calories, protein_g, carbs_g, fat_g, water_l, goal, updated_at
  ) VALUES (
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

  RETURN QUERY SELECT v_id, v_revision;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_protocol_with_plan(uuid, uuid, uuid, text, jsonb, boolean, boolean, text, integer, integer, integer, integer, numeric, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_protocol_with_plan(uuid, uuid, uuid, text, jsonb, boolean, boolean, text, integer, integer, integer, integer, numeric, integer)
  TO service_role;