ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS template_kind text NOT NULL DEFAULT 'protocol';

ALTER TABLE public.protocols
  DROP CONSTRAINT IF EXISTS protocols_template_kind_valid;
ALTER TABLE public.protocols
  ADD CONSTRAINT protocols_template_kind_valid
  CHECK (template_kind IN ('protocol', 'workout'));

COMMENT ON COLUMN public.protocols.template_kind IS
  'Só tem sentido quando is_template = true. "protocol" = protocolo completo (treino+dieta+suplementos+macros). "workout" = apenas o bloco de treino (payload = WorkoutBlockPayloadSchema), reutilizável para qualquer aluno.';

UPDATE public.protocols
SET template_kind = 'workout'
WHERE is_template = true
  AND template_source = 'system_reference';

CREATE INDEX IF NOT EXISTS protocols_workout_template_catalog_idx
  ON public.protocols (template_kind, coach_id)
  WHERE is_template = true;

CREATE TABLE IF NOT EXISTS public.workout_block_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS workout_block_versions_template_id_version_idx
  ON public.workout_block_versions (template_id, version DESC);

GRANT SELECT, INSERT ON public.workout_block_versions TO authenticated;
GRANT ALL ON public.workout_block_versions TO service_role;

ALTER TABLE public.workout_block_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own workout block versions"
  ON public.workout_block_versions FOR SELECT
  TO authenticated
  USING (
    (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Coach can insert own workout block versions"
  ON public.workout_block_versions FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE OR REPLACE FUNCTION public.save_workout_block_template(
  p_template_id uuid,
  p_coach_id uuid,
  p_name text,
  p_payload jsonb
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
    RAISE EXCEPTION 'not authorized to save workout template for another coach';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.protocols (coach_id, student_id, name, is_template, template_kind, payload, active)
    VALUES (p_coach_id, p_coach_id, p_name, true, 'workout', p_payload, false)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT payload INTO v_prev_payload
  FROM public.protocols
  WHERE id = p_template_id AND coach_id = p_coach_id AND template_kind = 'workout'
  FOR UPDATE;

  IF v_prev_payload IS NOT NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.workout_block_versions
    WHERE template_id = p_template_id;

    INSERT INTO public.workout_block_versions (template_id, coach_id, version, payload)
    VALUES (p_template_id, p_coach_id, v_next_version, v_prev_payload);
  END IF;

  UPDATE public.protocols
  SET name = p_name,
      payload = p_payload,
      updated_at = now()
  WHERE id = p_template_id
    AND coach_id = p_coach_id
    AND template_kind = 'workout'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'workout template not found for this coach';
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_workout_block_template(uuid, uuid, text, jsonb) TO authenticated;