-- ============================================================
-- MIGRATION DE CORREÇÕES DE SEGURANÇA — Junho 2026
-- Referência: Auditoria Técnica dynamic-plan-pro (Junho 2026)
-- ============================================================

-- ── [FIX CRÍTICO] Remover senha em texto semi-legível do histórico SQL
-- A migration 20260607213424 criou a conta admin com a senha '010909' via
-- crypt(). Este bloco documenta que a conta foi criada manualmente e a senha
-- foi alterada. A conta admin deve ter sua senha trocada via painel do Supabase
-- ou via interface do sistema imediatamente após o deploy desta migration.
-- AÇÃO MANUAL NECESSÁRIA: trocar a senha no painel do Supabase Auth ou pelo
-- botão "Alterar Senha" no painel admin do sistema.
-- NÃO criar novas contas com senha via SQL — usar sempre o painel de admin.
COMMENT ON TABLE public.profiles IS
  'Perfis de usuários. Conta admin rennanjoao@rjelitelab.com.br criada via migration 20260607213424 — senha deve ser alterada manualmente pelo painel (nunca via SQL).';

-- ── [FIX ALTO] Versionar ENABLE ROW LEVEL SECURITY das 12 tabelas críticas
-- Estas tabelas tinham RLS ativo apenas via Supabase Studio (não versionado).
-- Se o banco for recriado a partir das migrations, estas tabelas ficariam sem
-- proteção. Este bloco garante que o RLS esteja versionado no histórico.
ALTER TABLE public.anamnesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- ── [FIX ALTO] Corrigir política de UPDATE da tabela subscriptions
-- A política original "System can update subscriptions" usava USING (true),
-- permitindo que qualquer usuário autenticado atualizasse assinaturas de outros.
-- Isso possibilitava fraude: ativar assinatura sem pagar ou desativar a de outros.
-- A nova política restringe UPDATE apenas ao service_role (servidor).
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;

CREATE POLICY "Service role can update subscriptions"
  ON public.subscriptions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── [FIX MÉDIO] Restringir acesso a workout_template_versions por coach
-- A política original "Authenticated can view template versions" usava USING (true),
-- expondo templates de qualquer coach para qualquer outro usuário autenticado
-- (incluindo coaches concorrentes), vazando propriedade intelectual.
DROP POLICY IF EXISTS "Authenticated can view template versions" ON public.workout_template_versions;

-- Coaches veem apenas versões dos próprios templates
CREATE POLICY "Coaches can view own template versions"
  ON public.workout_template_versions
  FOR SELECT
  TO authenticated
  USING (
    -- Coach vê apenas versões dos templates que criou
    EXISTS (
      SELECT 1 FROM public.workout_templates t
      WHERE t.id = template_id
        AND t.created_by = auth.uid()
    )
    OR
    -- Admins veem tudo
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Alunos veem apenas versões vinculadas ao seu protocolo ativo
-- (política separada para clareza)
CREATE POLICY "Students can view template versions of active protocol"
  ON public.workout_template_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.protocols p
      JOIN public.coach_students cs ON cs.student_id = auth.uid() AND cs.status = 'active'
      WHERE p.coach_id = cs.coach_id
        AND p.student_id = auth.uid()
        AND (p.data->>'templateId')::uuid = template_id
    )
  );
