-- Diretrizes: histórico de versões + RPC atômica (mesmo padrão de treino/dieta/periodização).
CREATE TABLE IF NOT EXISTS public.guidelines_block_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS guidelines_block_versions_template_id_version_idx
  ON public.guidelines_block_versions (template_id, version DESC);

GRANT SELECT, INSERT ON public.guidelines_block_versions TO authenticated;
GRANT ALL ON public.guidelines_block_versions TO service_role;

ALTER TABLE public.guidelines_block_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own guidelines block versions"
  ON public.guidelines_block_versions FOR SELECT
  TO authenticated
  USING (
    (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Coach can insert own guidelines block versions"
  ON public.guidelines_block_versions FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE OR REPLACE FUNCTION public.save_guidelines_block_template(
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
    RAISE EXCEPTION 'not authorized to save guidelines template for another coach';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.protocols (coach_id, student_id, name, is_template, template_kind, payload, active)
    VALUES (p_coach_id, p_coach_id, p_name, true, 'guidelines', p_payload, false)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT payload INTO v_prev_payload
  FROM public.protocols
  WHERE id = p_template_id AND coach_id = p_coach_id AND template_kind = 'guidelines'
  FOR UPDATE;

  IF v_prev_payload IS NOT NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.guidelines_block_versions
    WHERE template_id = p_template_id;

    INSERT INTO public.guidelines_block_versions (template_id, coach_id, version, payload)
    VALUES (p_template_id, p_coach_id, v_next_version, v_prev_payload);
  END IF;

  UPDATE public.protocols
  SET name = p_name,
      payload = p_payload,
      updated_at = now()
  WHERE id = p_template_id
    AND coach_id = p_coach_id
    AND template_kind = 'guidelines'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'guidelines template not found for this coach';
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_guidelines_block_template(uuid, uuid, text, jsonb) TO authenticated;

-- Padroniza o sentinela: templates do coach usam student_id = coach_id (como os outros 3 tipos).
-- Templates de sistema (coach_id NULL) não são tocados.
UPDATE public.protocols
SET student_id = coach_id
WHERE is_template = true
  AND template_kind = 'guidelines'
  AND student_id IS NULL
  AND coach_id IS NOT NULL;