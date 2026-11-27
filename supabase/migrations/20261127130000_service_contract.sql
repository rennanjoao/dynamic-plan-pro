-- Contrato de prestação de serviços aceito no app (aluno ↔ coach).
--
-- 1) coach_contract_settings: CPF/CNPJ, razão social (quando CNPJ) e Instagram
--    que aparecem no contrato. Fica fora de profiles para não ficar visível a
--    todo usuário logado.
-- 2) contract_party_for_student(): o aluno lê só os dados do SEU coach ativo
--    (nome, CREF, CPF/CNPJ, razão social, e-mail, WhatsApp, Instagram) e o
--    código de parceria dele, se entrou por um, para montar o contrato.
-- 3) contract_acceptances: um registro por aceite (texto mostrado, versão,
--    etapa, plano, valores, desconto, CPF). O aluno aceita no cadastro (com a
--    tabela de planos) e o plano escolhido é registrado no pagamento. Sem UPDATE/DELETE pelo app; horário do
--    servidor. Na exclusão do aluno o registro fica (prova da contratação e da
--    cobrança), sem o vínculo com a conta.

-- 1) Dados do coach para o contrato
CREATE TABLE IF NOT EXISTS public.coach_contract_settings (
  coach_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  document      text,
  company_name  text,
  instagram     text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_contract_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.coach_contract_settings TO authenticated;
GRANT ALL ON public.coach_contract_settings TO service_role;

DROP POLICY IF EXISTS ccs_select_own ON public.coach_contract_settings;
CREATE POLICY ccs_select_own ON public.coach_contract_settings
  FOR SELECT TO authenticated USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS ccs_insert_own ON public.coach_contract_settings;
CREATE POLICY ccs_insert_own ON public.coach_contract_settings
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
DROP POLICY IF EXISTS ccs_update_own ON public.coach_contract_settings;
CREATE POLICY ccs_update_own ON public.coach_contract_settings
  FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- 2) Dados do coach ativo do aluno logado
CREATE OR REPLACE FUNCTION public.contract_party_for_student()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'coach_id', cs.coach_id,
    'name', COALESCE(NULLIF(trim(p.full_name), ''), 'Treinador'),
    'team_name', p.team_name,
    'cref', p.cref,
    'document', ccs.document,
    'company_name', ccs.company_name,
    'instagram', ccs.instagram,
    'whatsapp', p.support_whatsapp,
    'email', COALESCE(NULLIF(trim(p.notification_email), ''), u.email),
    'partner_code', (SELECT pa.access_code FROM public.partner_attributions pa WHERE pa.student_id = auth.uid() LIMIT 1)
  )
  FROM public.coach_students cs
  LEFT JOIN public.profiles p ON p.user_id = cs.coach_id
  LEFT JOIN public.coach_contract_settings ccs ON ccs.coach_id = cs.coach_id
  LEFT JOIN auth.users u ON u.id = cs.coach_id
  WHERE cs.student_id = auth.uid() AND cs.status = 'active'
  ORDER BY cs.updated_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.contract_party_for_student() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_party_for_student() TO authenticated;

-- 3) Aceites
CREATE OR REPLACE FUNCTION public.is_my_active_coach(_coach uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.coach_students cs
                 WHERE cs.student_id = auth.uid() AND cs.coach_id = _coach AND cs.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.is_my_active_coach(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_active_coach(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.contract_acceptances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  coach_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version            text NOT NULL,
  -- 'cadastro': aceito na anamnese, com a tabela de planos (sem plano escolhido).
  -- 'pagamento': registro do plano escolhido, valor final e desconto.
  stage              text NOT NULL DEFAULT 'pagamento' CHECK (stage IN ('cadastro', 'pagamento')),
  plan_slug          text,
  plan_name          text,
  duration_months    integer CHECK (duration_months IS NULL OR duration_months > 0),
  list_price_cents   integer CHECK (list_price_cents IS NULL OR list_price_cents >= 0),
  final_price_cents  integer CHECK (final_price_cents IS NULL OR final_price_cents >= 0),
  discount_note      text,
  cpf                text NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  guardian_name      text,
  guardian_cpf       text CHECK (guardian_cpf IS NULL OR guardian_cpf ~ '^[0-9]{11}$'),
  text_shown         text NOT NULL,
  user_agent         text,
  accepted_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_acceptances_student_idx
  ON public.contract_acceptances (student_id, version, stage, plan_slug, final_price_cents);

ALTER TABLE public.contract_acceptances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.contract_acceptances TO authenticated;
GRANT ALL ON public.contract_acceptances TO service_role;

DROP POLICY IF EXISTS ca_insert_own ON public.contract_acceptances;
CREATE POLICY ca_insert_own ON public.contract_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND coach_id IS NOT NULL
    AND public.is_my_active_coach(coach_id)
  );
DROP POLICY IF EXISTS ca_select_own ON public.contract_acceptances;
CREATE POLICY ca_select_own ON public.contract_acceptances
  FOR SELECT TO authenticated USING (student_id = auth.uid());
DROP POLICY IF EXISTS ca_select_coach ON public.contract_acceptances;
CREATE POLICY ca_select_coach ON public.contract_acceptances
  FOR SELECT TO authenticated USING (coach_id = auth.uid() AND public.coach_can_see_student(student_id));
DROP POLICY IF EXISTS ca_select_admin ON public.contract_acceptances;
CREATE POLICY ca_select_admin ON public.contract_acceptances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.contract_acceptances_server_time()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contract_acceptances_server_time ON public.contract_acceptances;
CREATE TRIGGER contract_acceptances_server_time
  BEFORE INSERT ON public.contract_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.contract_acceptances_server_time();

-- 4) Exclusão de dados (LGPD): o aceite fica guardado (student_id vira NULL).
CREATE OR REPLACE FUNCTION public.lgpd_delete_student_rows(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Registros que a lei manda guardar ou que pertencem ao coach/admin.
  keep text[] := ARRAY[
    'coach_finances',        -- financeiro do coach (student_id vira NULL pela FK)
    'student_subscriptions', -- pagamentos do aluno (obrigação legal)
    'partner_commissions',   -- comissões (student_id vira NULL pela FK)
    'access_codes',          -- código do coach (student_id vira NULL pela FK)
    'contract_acceptances',  -- prova do contrato/cobrança (student_id vira NULL pela FK)
    'admin_audit_log'
  ];
  r record;
  n bigint;
  result jsonb := '{}'::jsonb;
  pending int;
  progress boolean;
  last_err text;
  pass int;
BEGIN
  IF p_student IS NULL THEN
    RAISE EXCEPTION 'lgpd_delete_student_rows: aluno não informado';
  END IF;

  FOR pass IN 1..6 LOOP
    pending := 0;
    progress := false;
    FOR r IN
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.column_name IN ('student_id', 'user_id')
        AND c.data_type = 'uuid'
        AND NOT (c.table_name = ANY (keep))
      ORDER BY c.table_name, c.column_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING p_student;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          progress := true;
          result := jsonb_set(
            result, ARRAY[r.table_name],
            to_jsonb(COALESCE((result ->> r.table_name)::bigint, 0) + n)
          );
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        -- Outra linha do mesmo aluno ainda aponta para esta; tenta de novo na próxima volta.
        pending := pending + 1;
        last_err := SQLERRM;
      END;
    END LOOP;
    EXIT WHEN pending = 0;
    IF NOT progress THEN
      RAISE EXCEPTION 'lgpd_delete_student_rows: dependência pendente: %', last_err;
    END IF;
  END LOOP;

  IF pending > 0 THEN
    RAISE EXCEPTION 'lgpd_delete_student_rows: dependência pendente: %', last_err;
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_delete_student_rows(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lgpd_delete_student_rows(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_delete_student_rows(uuid) TO service_role;
