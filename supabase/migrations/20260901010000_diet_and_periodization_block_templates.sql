```sql
-- Biblioteca de templates: "Dieta" e "Periodização" isolados, no mesmo
-- padrão já usado para "Treino" (migration 20260901002438): tabela
-- `protocols` (is_template=true) discriminada por `template_kind`, com
-- tabela de histórico de versões + RPC atômica (snapshot da versão anterior
-- + escrita, numa só transação, serializada por FOR UPDATE).

-- 1. Amplia o CHECK de template_kind para aceitar os 2 novos tipos.
ALTER TABLE public.protocols
  DROP CONSTRAINT IF EXISTS protocols_template_kind_valid;
ALTER TABLE public.protocols
  ADD CONSTRAINT protocols_template_kind_valid
  CHECK (template_kind IN ('protocol', 'workout', 'diet', 'periodization'));

COMMENT ON COLUMN public.protocols.template_kind IS
  'Só tem sentido quando is_template = true. "protocol" = protocolo completo (treino+dieta+suplementos+macros). "workout" = bloco de treino (payload = WorkoutBlockPayloadSchema). "diet" = bloco de dieta (payload = DietBlockPayloadSchema). "periodization" = bloco de periodização (payload = PeriodizationBlockPayloadSchema). Reutilizáveis para qualquer aluno.';

-- 2. Tabelas de histórico de versões (mesma forma de workout_block_versions).
CREATE TABLE IF NOT EXISTS public.diet_block_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS diet_block_versions_template_id_version_idx
  ON public.diet_block_versions (template_id, version DESC);

GRANT SELECT, INSERT ON public.diet_block_versions TO authenticated;
GRANT ALL ON public.diet_block_versions TO service_role;

ALTER TABLE public.diet_block_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own diet block versions"
  ON public.diet_block_versions FOR SELECT
  TO authenticated
  USING (
    (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Coach can insert own diet block versions"
  ON public.diet_block_versions FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE TABLE IF NOT EXISTS public.periodization_block_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS periodization_block_versions_template_id_version_idx
  ON public.periodization_block_versions (template_id, version DESC);

GRANT SELECT, INSERT ON public.periodization_block_versions TO authenticated;
GRANT ALL ON public.periodization_block_versions TO service_role;

ALTER TABLE public.periodization_block_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own periodization block versions"
  ON public.periodization_block_versions FOR SELECT
  TO authenticated
  USING (
    (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Coach can insert own periodization block versions"
  ON public.periodization_block_versions FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));

-- 3. RPCs atômicas (create-or-update + snapshot de versão), mesma forma de
--    save_workout_block_template.
CREATE OR REPLACE FUNCTION public.save_diet_block_template(
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
    RAISE EXCEPTION 'not authorized to save diet template for another coach';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.protocols (coach_id, student_id, name, is_template, template_kind, payload, active)
    VALUES (p_coach_id, p_coach_id, p_name, true, 'diet', p_payload, false)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT payload INTO v_prev_payload
  FROM public.protocols
  WHERE id = p_template_id AND coach_id = p_coach_id AND template_kind = 'diet'
  FOR UPDATE;

  IF v_prev_payload IS NOT NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.diet_block_versions
    WHERE template_id = p_template_id;

    INSERT INTO public.diet_block_versions (template_id, coach_id, version, payload)
    VALUES (p_template_id, p_coach_id, v_next_version, v_prev_payload);
  END IF;

  UPDATE public.protocols
  SET name = p_name,
      payload = p_payload,
      updated_at = now()
  WHERE id = p_template_id
    AND coach_id = p_coach_id
    AND template_kind = 'diet'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'diet template not found for this coach';
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_diet_block_template(uuid, uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_periodization_block_template(
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
    RAISE EXCEPTION 'not authorized to save periodization template for another coach';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.protocols (coach_id, student_id, name, is_template, template_kind, payload, active)
    VALUES (p_coach_id, p_coach_id, p_name, true, 'periodization', p_payload, false)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT payload INTO v_prev_payload
  FROM public.protocols
  WHERE id = p_template_id AND coach_id = p_coach_id AND template_kind = 'periodization'
  FOR UPDATE;

  IF v_prev_payload IS NOT NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.periodization_block_versions
    WHERE template_id = p_template_id;

    INSERT INTO public.periodization_block_versions (template_id, coach_id, version, payload)
    VALUES (p_template_id, p_coach_id, v_next_version, v_prev_payload);
  END IF;

  UPDATE public.protocols
  SET name = p_name,
      payload = p_payload,
      updated_at = now()
  WHERE id = p_template_id
    AND coach_id = p_coach_id
    AND template_kind = 'periodization'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'periodization template not found for this coach';
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_periodization_block_template(uuid, uuid, text, jsonb) TO authenticated;
