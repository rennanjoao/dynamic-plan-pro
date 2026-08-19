-- 1. Metadados de catálogo para templates de protocolo
ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS template_profile text,
  ADD COLUMN IF NOT EXISTS template_division text,
  ADD COLUMN IF NOT EXISTS template_source text;

COMMENT ON COLUMN public.protocols.template_source IS
  'Origem do template. "system_reference" = migrado de SYSTEM_TEMPLATES (base ACSM/NSCA/Schoenfeld/Contreras) — conteúdo de referência, NÃO é a metodologia oficial do projeto.';

-- 2. Templates do sistema (sem coach e sem aluno) são legíveis por qualquer usuário logado
CREATE POLICY "Authenticated can read system templates"
ON public.protocols
FOR SELECT
TO authenticated
USING (is_template = true AND coach_id IS NULL AND student_id IS NULL);

-- 3. workout_templates vira legado somente-leitura (dados preservados)
DROP POLICY IF EXISTS "Coaches can insert own workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS "Admins can create workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS "Coaches/admins can insert versions of own templates" ON public.workout_template_versions;

COMMENT ON TABLE public.workout_templates IS
  'LEGADO SOMENTE-LEITURA: substituída por protocols (is_template = true). Registros existentes preservados; novas inserções bloqueadas por RLS.';
COMMENT ON TABLE public.workout_template_versions IS
  'LEGADO SOMENTE-LEITURA: histórico da tabela workout_templates (descontinuada).';

-- 4. Função de trigger não deve ser chamável via API
REVOKE EXECUTE ON FUNCTION public.snapshot_prescription_profile() FROM PUBLIC, anon, authenticated;