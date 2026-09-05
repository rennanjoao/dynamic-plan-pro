ALTER TABLE public.protocols
  DROP CONSTRAINT IF EXISTS protocols_template_kind_valid;

ALTER TABLE public.protocols
  ADD CONSTRAINT protocols_template_kind_valid
  CHECK (template_kind IN ('protocol', 'workout', 'diet', 'periodization', 'guidelines'));

COMMENT ON COLUMN public.protocols.template_kind IS
  'Só tem sentido quando is_template = true. "protocol" = protocolo completo. "workout" = bloco de treino. "diet" = bloco de dieta. "periodization" = bloco de periodização. "guidelines" = bloco de diretrizes (treino, dieta, semana, sono).';