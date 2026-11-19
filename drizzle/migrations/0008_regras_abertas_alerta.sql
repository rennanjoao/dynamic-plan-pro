-- ════════════════════════════════════════════════════════════════════════════
-- Alerta do Lovable "Some access rules let everyone through" (18/11/2026)
-- Análise das 5 regras com condição "true" no banco de produção:
--
--  1. app_settings (SELECT para todo logado) → CORRIGIDA.
--     A chave 'coach_billing_state' guarda o preço por aluno da plataforma e
--     os PREÇOS ESPECIAIS por coach. Qualquer aluno ou coach logado conseguia
--     ler. Agora: todo logado lê só 'coach_plans' (tela /planos); o resto só
--     o admin (a regra de escrita do admin, app_settings_admin_write, continua).
--  2. exercise_library (SELECT para todo logado) → MANTIDA de propósito.
--     É a biblioteca de exercícios/GIFs que o aluno usa no Modo Treino.
--  3. subscriptions (UPDATE para service_role) → REMOVIDA.
--     O service_role já ignora as regras de acesso; esta regra não fazia nada
--     além de disparar o alerta. Nenhuma tela usa essa tabela.
--  4/5. workout_templates e workout_template_versions (SELECT para todo
--     logado) → restritas a coach e admin. Biblioteca antiga de modelos (só
--     leitura); aluno nunca abre essa tela.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) app_settings
DROP POLICY IF EXISTS "app_settings_read_auth" ON public.app_settings;
DROP POLICY IF EXISTS app_settings_read_public_keys ON public.app_settings;
CREATE POLICY app_settings_read_public_keys
  ON public.app_settings FOR SELECT TO authenticated
  USING (key = 'coach_plans' OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) subscriptions
DROP POLICY IF EXISTS "Service role can update subscriptions" ON public.subscriptions;

-- 4) workout_templates
DROP POLICY IF EXISTS "Everyone can view workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS workout_templates_read_coach_admin ON public.workout_templates;
CREATE POLICY workout_templates_read_coach_admin
  ON public.workout_templates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 5) workout_template_versions
DROP POLICY IF EXISTS "Authenticated can view template versions" ON public.workout_template_versions;
DROP POLICY IF EXISTS workout_template_versions_read_coach_admin ON public.workout_template_versions;
CREATE POLICY workout_template_versions_read_coach_admin
  ON public.workout_template_versions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
