-- Cobrança, acesso e bloqueio dos alunos (auditoria do Financeiro, 28/11/2026).
--
-- Regras do dono da plataforma:
--  * Aluno que não paga: 7 dias de tolerância depois do vencimento; no 8º dia o
--    acesso é pausado (tela com os planos e o botão de pagar).
--  * O coach pode liberar o acesso de um aluno até uma data (ex.: 30 dias).
--  * Aluna que vira parceira (código de parceria) fica vitalícia (isenta) até o
--    coach mudar. Coach parceiro (convite especial) fica vitalício na plataforma.
--  * Desconto de parceria: 10% só no PRIMEIRO pagamento, só em plano trimestral
--    ou semestral (consultoria), sobre o preço do "Meus Planos".
--  * Plano "só acesso" (ex.: R$ 69,90): o aluno mantém o app e os check-ins, sem
--    gerar alertas de acompanhamento para o coach. "Ajuste pontual" (ex.: R$ 250)
--    é cobrança avulsa: não mexe no período do plano.
--  * Pagamento manual e online seguem o MESMO caminho (ativa o plano, avança o
--    vencimento e gera a comissão da parceira na 1ª ativação).

-- ── 0) Data de hoje no fuso de São Paulo ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_today()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- ── 1) Perfil: bloqueio e período de teste só pelo admin ou pelo servidor ──
-- Antes, qualquer coach podia apagar o próprio bloqueio ou se dar "vitalício"
-- editando o próprio perfil direto pela API.
CREATE OR REPLACE FUNCTION public.profiles_guard_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Servidor (service_role / migrações: sem usuário) e admin podem tudo.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.blocked_until := NULL;
    NEW.trial_ends_at := NULL;
  ELSE
    NEW.blocked_until := OLD.blocked_until;
    NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_billing_fields ON public.profiles;
CREATE TRIGGER profiles_guard_billing_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_billing_fields();

-- ── 2) Novas colunas ───────────────────────────────────────────────────────
ALTER TABLE public.student_plan_catalog
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'coaching';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_plan_catalog_kind_check') THEN
    ALTER TABLE public.student_plan_catalog
      ADD CONSTRAINT student_plan_catalog_kind_check CHECK (kind IN ('coaching', 'access', 'one_off'));
  END IF;
END $$;

ALTER TABLE public.student_subscriptions
  ADD COLUMN IF NOT EXISTS plan_kind text NOT NULL DEFAULT 'coaching';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_subscriptions_plan_kind_check') THEN
    ALTER TABLE public.student_subscriptions
      ADD CONSTRAINT student_subscriptions_plan_kind_check CHECK (plan_kind IN ('coaching', 'access'));
  END IF;
END $$;

ALTER TABLE public.coach_finances
  ADD COLUMN IF NOT EXISTS charge_kind text,
  ADD COLUMN IF NOT EXISTS list_price_cents integer,
  ADD COLUMN IF NOT EXISTS discount_cents integer,
  ADD COLUMN IF NOT EXISTS discount_note text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_finances_charge_kind_check') THEN
    ALTER TABLE public.coach_finances
      ADD CONSTRAINT coach_finances_charge_kind_check
      CHECK (charge_kind IS NULL OR charge_kind IN ('coaching', 'access', 'one_off'));
  END IF;
END $$;
-- Cobranças já pagas: já foram aplicadas pelo caminho antigo.
UPDATE public.coach_finances SET applied_at = COALESCE(paid_at, now())
 WHERE status = 'paid' AND applied_at IS NULL;

ALTER TABLE public.coach_students
  ADD COLUMN IF NOT EXISTS access_granted_until date,
  ADD COLUMN IF NOT EXISTS exempt_reason text;

ALTER TABLE public.coach_invites
  ADD COLUMN IF NOT EXISTS lifetime boolean NOT NULL DEFAULT false;

-- Data de início da regra de bloqueio: ninguém é bloqueado por atraso anterior
-- a ela (dá ao coach 7 dias para revisar quem está em atraso).
INSERT INTO public.app_settings (key, value)
VALUES ('student_block_start', to_jsonb(public.sp_today()::text))
ON CONFLICT (key) DO NOTHING;

-- ── 3) Preço do plano para um aluno (com desconto de parceria) ─────────────
CREATE OR REPLACE FUNCTION public.plan_quote(p_student uuid, p_plan_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach uuid;
  v_plan record;
  v_partner_code text;
  v_first boolean;
  v_disc_bp integer := 0;
  v_final integer;
BEGIN
  SELECT cs.coach_id INTO v_coach
    FROM coach_students cs
   WHERE cs.student_id = p_student AND cs.status = 'active'
   ORDER BY cs.updated_at DESC
   LIMIT 1;
  IF v_coach IS NULL THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_student AND auth.uid() <> v_coach
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan
    FROM student_plan_catalog p
   WHERE p.slug = p_plan_slug AND p.is_active AND (p.coach_id = v_coach OR p.coach_id IS NULL)
   ORDER BY (p.coach_id IS NULL) ASC
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT pa.access_code INTO v_partner_code
    FROM partner_attributions pa
    JOIN partner_profiles pp ON pp.user_id = pa.partner_id AND pp.status = 'active'
   WHERE pa.student_id = p_student;

  -- 1º pagamento = nenhum pagamento anterior (fora ajustes avulsos).
  v_first := NOT EXISTS (
    SELECT 1 FROM coach_finances cf
     WHERE cf.student_id = p_student AND cf.status = 'paid'
       AND COALESCE(cf.charge_kind, '') <> 'one_off'
  );

  IF v_partner_code IS NOT NULL AND v_first
     AND v_plan.kind = 'coaching' AND v_plan.duration_months >= 3 THEN
    v_disc_bp := 1000;
  END IF;

  v_final := round(v_plan.price_cents * (10000 - v_disc_bp) / 10000.0)::integer;

  RETURN jsonb_build_object(
    'plan_id', v_plan.id,
    'coach_id', v_coach,
    'slug', v_plan.slug,
    'name', v_plan.name,
    'kind', v_plan.kind,
    'duration_months', v_plan.duration_months,
    'list_cents', v_plan.price_cents,
    'discount_bp', v_disc_bp,
    'discount_cents', v_plan.price_cents - v_final,
    'final_cents', v_final,
    'partner_applied', v_disc_bp > 0,
    'partner_code', v_partner_code
  );
END;
$$;

-- Todos os planos ativos do coach do aluno logado, já com o preço final.
CREATE OR REPLACE FUNCTION public.my_plan_quotes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH link AS (
    SELECT cs.coach_id FROM coach_students cs
     WHERE cs.student_id = auth.uid() AND cs.status = 'active'
     ORDER BY cs.updated_at DESC LIMIT 1
  )
  , own AS (
    SELECT p.* FROM student_plan_catalog p, link WHERE p.coach_id = link.coach_id AND p.is_active
  ), plans AS (
    -- Sem planos próprios do coach: usa os planos padrão (mesmo comportamento do app).
    SELECT * FROM own
    UNION ALL
    SELECT p.* FROM student_plan_catalog p
     WHERE p.coach_id IS NULL AND p.is_active AND NOT EXISTS (SELECT 1 FROM own)
       AND EXISTS (SELECT 1 FROM link)
  )
  SELECT COALESCE(jsonb_agg(public.plan_quote(auth.uid(), p.slug) ORDER BY p.sort_order, p.duration_months), '[]'::jsonb)
    FROM plans p;
$$;

-- ── 4) Criar cobrança de plano (coach, admin ou servidor) ──────────────────
CREATE OR REPLACE FUNCTION public.create_plan_charge(
  p_student uuid,
  p_plan_slug text,
  p_due_date date DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_provider text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q jsonb;
  v_coach uuid;
  v_kind text;
  v_due date;
  v_sub student_subscriptions%ROWTYPE;
  v_paid_before boolean;
  v_finance uuid;
  v_note text;
BEGIN
  q := public.plan_quote(p_student, p_plan_slug);
  IF q IS NULL THEN RAISE EXCEPTION 'plano indisponível' USING ERRCODE = 'P0001'; END IF;
  v_coach := (q->>'coach_id')::uuid;
  v_kind := q->>'kind';
  -- Só o coach, o admin ou o servidor (checkout online, a pedido do aluno).
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_coach
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;

  -- Vencimento: o informado pelo coach; senão herda a dívida em aberto (trocar
  -- de plano ou gerar um link novo não "zera" o atraso) ou o fim do período
  -- pago; sem nada disso, hoje.
  v_due := COALESCE(
    p_due_date,
    CASE WHEN v_kind <> 'one_off' THEN (
      SELECT min(cf.due_date) FROM coach_finances cf
       WHERE cf.student_id = p_student AND cf.status = 'pending' AND cf.due_date IS NOT NULL
         AND cf.amount > 0 AND COALESCE(cf.charge_kind, '') <> 'one_off'
    ) END,
    CASE WHEN v_kind <> 'one_off' THEN (
      SELECT ss.next_due_date FROM student_subscriptions ss
       WHERE ss.student_id = p_student AND ss.status IN ('active', 'overdue')
       ORDER BY ss.created_at DESC LIMIT 1
    ) END,
    public.sp_today()
  );
  v_note := CASE WHEN (q->>'partner_applied')::boolean
    THEN 'Desconto de parceria 10% (código ' || COALESCE(q->>'partner_code', '-') || ') — 1º pagamento'
  END;

  IF v_kind = 'one_off' THEN
    -- Ajuste pontual: reaproveita uma cobrança avulsa igual ainda aberta.
    SELECT id INTO v_finance FROM coach_finances
     WHERE student_id = p_student AND coach_id = v_coach AND status = 'pending'
       AND charge_kind = 'one_off' AND plan_slug = p_plan_slug
     LIMIT 1;
    IF v_finance IS NOT NULL THEN RETURN v_finance; END IF;
    INSERT INTO coach_finances (coach_id, student_id, description, amount, amount_cents, list_price_cents,
                                discount_cents, due_date, status, plan_slug, plan_name_snapshot,
                                charge_kind, source, provider)
    VALUES (v_coach, p_student, q->>'name', (q->>'final_cents')::int / 100.0, (q->>'final_cents')::int,
            (q->>'list_cents')::int, (q->>'discount_cents')::int, v_due, 'pending', p_plan_slug, q->>'name',
            'one_off', p_source, p_provider)
    RETURNING id INTO v_finance;
    RETURN v_finance;
  END IF;

  -- No máximo uma cobrança de plano aberta por aluno (ajustes avulsos ficam).
  UPDATE coach_finances SET status = 'canceled'
   WHERE student_id = p_student AND status = 'pending' AND COALESCE(charge_kind, '') <> 'one_off';

  SELECT * INTO v_sub FROM student_subscriptions
   WHERE student_id = p_student AND status IN ('active', 'pending', 'overdue')
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO student_subscriptions (student_id, coach_id, plan_slug, plan_name, price_cents, cycle_months,
                                       started_on, next_due_date, status, plan_kind, provider)
    VALUES (p_student, v_coach, q->>'slug', q->>'name', (q->>'final_cents')::int, (q->>'duration_months')::int,
            v_due, NULL, 'pending', v_kind, p_provider)
    RETURNING * INTO v_sub;
  ELSE
    -- Contrato ainda nunca pago: pode trocar o plano livremente.
    v_paid_before := EXISTS (SELECT 1 FROM coach_finances WHERE subscription_id = v_sub.id AND status = 'paid');
    IF v_sub.status = 'pending' AND NOT v_paid_before THEN
      UPDATE student_subscriptions
         SET plan_slug = q->>'slug', plan_name = q->>'name', price_cents = (q->>'final_cents')::int,
             cycle_months = (q->>'duration_months')::int, plan_kind = v_kind
       WHERE id = v_sub.id;
    END IF;
    -- Contrato ativo: nada muda até o pagamento confirmar (troca/renovação).
  END IF;

  INSERT INTO coach_finances (coach_id, student_id, description, amount, amount_cents, list_price_cents,
                              discount_cents, discount_note, due_date, status, subscription_id, plan_slug,
                              plan_cycle_months, plan_name_snapshot, charge_kind, source, provider)
  VALUES (v_coach, p_student, 'Plano ' || (q->>'name'), (q->>'final_cents')::int / 100.0, (q->>'final_cents')::int,
          (q->>'list_cents')::int, (q->>'discount_cents')::int, v_note, v_due, 'pending', v_sub.id, q->>'slug',
          (q->>'duration_months')::int, q->>'name', v_kind, p_source, p_provider)
  RETURNING id INTO v_finance;

  UPDATE student_subscriptions SET current_charge_id = v_finance WHERE id = v_sub.id;
  RETURN v_finance;
END;
$$;

-- ── 5) Aplicar um pagamento confirmado (ativa plano + comissão) ────────────
-- Idempotente (applied_at). Chamado pelos webhooks e pelo pagamento manual.
CREATE OR REPLACE FUNCTION public.apply_paid_charge(p_finance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f coach_finances%ROWTYPE;
  s student_subscriptions%ROWTYPE;
  v_kind text;
  v_cycle integer;
  v_prev_end date;
  v_base date;
  v_end date;
  v_partner uuid;
  v_rate integer;
  v_rows integer;
  v_commission boolean := false;
  v_name text;
BEGIN
  SELECT * INTO f FROM coach_finances WHERE id = p_finance_id FOR UPDATE;
  IF NOT FOUND OR f.status <> 'paid' OR f.applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied', false);
  END IF;

  v_kind := COALESCE(f.charge_kind, 'coaching');

  IF f.subscription_id IS NOT NULL AND v_kind <> 'one_off' THEN
    SELECT * INTO s FROM student_subscriptions WHERE id = f.subscription_id FOR UPDATE;
    IF FOUND THEN
      v_cycle := COALESCE(f.plan_cycle_months, s.cycle_months, 1);
      SELECT max(period_end) INTO v_prev_end FROM coach_finances
       WHERE subscription_id = s.id AND status = 'paid' AND id <> f.id AND period_end IS NOT NULL;
      IF v_prev_end IS NULL AND s.status IN ('active', 'overdue') THEN
        v_prev_end := s.next_due_date;
      END IF;
      v_base := GREATEST(public.sp_today(), COALESCE(v_prev_end, public.sp_today()));
      v_end := (v_base + make_interval(months => v_cycle))::date;

      UPDATE coach_finances SET period_start = v_base, period_end = v_end WHERE id = f.id;
      UPDATE student_subscriptions
         SET status = 'active',
             next_due_date = v_end,
             plan_slug = COALESCE(f.plan_slug, s.plan_slug),
             plan_name = COALESCE(f.plan_name_snapshot, s.plan_name),
             price_cents = COALESCE(f.amount_cents, s.price_cents),
             cycle_months = v_cycle,
             plan_kind = CASE WHEN v_kind = 'access' THEN 'access' ELSE 'coaching' END,
             payment_method = COALESCE(f.payment_method, s.payment_method),
             payment_source = COALESCE(f.source, s.payment_source),
             provider = COALESCE(f.provider, s.provider),
             external_transaction_id = COALESCE(f.mercado_pago_payment_id, f.external_id, s.external_transaction_id)
       WHERE id = s.id;
    END IF;

    -- Comissão da parceira: só no 1º pagamento de consultoria do aluno.
    IF v_kind = 'coaching' THEN
      SELECT pa.partner_id, pp.commission_rate_bp INTO v_partner, v_rate
        FROM partner_attributions pa
        JOIN partner_profiles pp ON pp.user_id = pa.partner_id AND pp.status = 'active'
       WHERE pa.student_id = f.student_id;
    END IF;
    IF v_partner IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM partner_commissions WHERE student_id = f.student_id AND eligible
    ) THEN
      INSERT INTO partner_commissions (student_id, partner_id, coach_id, subscription_id, gross_amount_cents,
                                       commission_rate_bp, commission_amount_cents, eligible, status)
      VALUES (f.student_id, v_partner, f.coach_id, f.subscription_id, COALESCE(f.amount_cents, 0),
              v_rate, round(COALESCE(f.amount_cents, 0) * v_rate / 10000.0)::integer, true, 'available')
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_commission := v_rows > 0;
      UPDATE partner_attributions SET locked = true WHERE student_id = f.student_id;
    END IF;
  END IF;

  IF v_kind = 'one_off' THEN
    SELECT COALESCE(NULLIF(trim(sp.full_name), ''), 'Aluno') INTO v_name
      FROM student_profiles sp WHERE sp.user_id = f.student_id;
    INSERT INTO coach_notifications (coach_id, student_id, student_name, context, message)
    VALUES (f.coach_id, f.student_id, COALESCE(v_name, 'Aluno'), 'Pagamento',
            'Pagamento confirmado: ' || f.description || '. Faça o ajuste do aluno.');
  END IF;

  UPDATE coach_finances SET applied_at = now() WHERE id = f.id;
  RETURN jsonb_build_object('applied', true, 'period_end', v_end, 'commission_created', v_commission);
END;
$$;

-- Pagamento registrado pelo coach (PIX fora da plataforma, dinheiro...).
CREATE OR REPLACE FUNCTION public.coach_settle_charge(p_finance_id uuid, p_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f coach_finances%ROWTYPE;
BEGIN
  SELECT * INTO f FROM coach_finances WHERE id = p_finance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cobrança não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF f.coach_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;
  IF f.status = 'pending' THEN
    UPDATE coach_finances
       SET status = 'paid', paid_at = now(), payment_method = p_method, source = 'manual'
     WHERE id = f.id;
  ELSIF f.status <> 'paid' THEN
    RAISE EXCEPTION 'cobrança cancelada' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.apply_paid_charge(f.id);
END;
$$;

-- ── 6) Situação de acesso do aluno ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.student_access_state(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l record;
  s record;
  v_today date := public.sp_today();
  v_grace constant integer := 7;
  v_pending_due date;
  v_pending_cents integer;
  v_plan_end date;
  v_overdue_since date;
  v_start date;
  v_block_on date;
  v_blocked boolean := false;
  v_reason text := 'ok';
BEGIN
  SELECT cs.coach_id, cs.is_exempt, cs.exempt_reason, cs.access_granted_until INTO l
    FROM coach_students cs
   WHERE cs.student_id = p_student AND cs.status = 'active'
   ORDER BY cs.updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', false, 'reason', 'no_coach');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_student AND auth.uid() <> l.coach_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'não autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT ss.plan_slug, ss.plan_name, ss.plan_kind, ss.status, ss.next_due_date INTO s
    FROM student_subscriptions ss
   WHERE ss.student_id = p_student AND ss.status IN ('active', 'pending', 'overdue')
   ORDER BY ss.created_at DESC LIMIT 1;

  SELECT min(cf.due_date), (array_agg(cf.amount_cents ORDER BY cf.due_date))[1]
    INTO v_pending_due, v_pending_cents
    FROM coach_finances cf
   WHERE cf.student_id = p_student AND cf.coach_id = l.coach_id AND cf.status = 'pending'
     AND cf.due_date IS NOT NULL AND cf.amount > 0 AND COALESCE(cf.charge_kind, '') <> 'one_off';

  v_plan_end := CASE WHEN s.status IN ('active', 'overdue') THEN s.next_due_date END;

  -- Coberto até o que vier por último: o fim do período pago ou o vencimento
  -- da cobrança aberta (o coach pode ter dado mais prazo). Renovar antes do fim
  -- do período nunca bloqueia; sem plano e sem cobrança, não há atraso.
  v_overdue_since := GREATEST(v_plan_end, v_pending_due);
  IF v_overdue_since >= v_today THEN v_overdue_since := NULL; END IF;

  SELECT (value #>> '{}')::date INTO v_start FROM app_settings WHERE key = 'student_block_start';
  IF v_overdue_since IS NOT NULL THEN
    v_block_on := GREATEST(v_overdue_since, COALESCE(v_start, v_overdue_since)) + v_grace + 1;
  END IF;

  IF l.is_exempt THEN
    v_reason := 'exempt';
  ELSIF l.access_granted_until IS NOT NULL AND l.access_granted_until >= v_today THEN
    v_reason := 'granted';
  ELSIF v_block_on IS NOT NULL AND v_today >= v_block_on THEN
    v_blocked := true;
    v_reason := 'overdue';
  ELSIF v_overdue_since IS NOT NULL THEN
    v_reason := 'grace';
  END IF;

  RETURN jsonb_build_object(
    'blocked', v_blocked,
    'reason', v_reason,
    'coach_id', l.coach_id,
    'exempt', l.is_exempt,
    'exempt_reason', l.exempt_reason,
    'granted_until', l.access_granted_until,
    'plan_slug', s.plan_slug,
    'plan_name', s.plan_name,
    'plan_kind', COALESCE(s.plan_kind, 'coaching'),
    'plan_status', s.status,
    'paid_through', v_plan_end,
    'pending_due', v_pending_due,
    'pending_cents', v_pending_cents,
    'overdue_since', v_overdue_since,
    'block_on', v_block_on
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_access_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.student_access_state(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.my_access_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public.student_access_state(auth.uid()) ->> 'blocked')::boolean, false);
$$;

-- Situação de todos os alunos ativos do coach logado (aba Financeiro).
CREATE OR REPLACE FUNCTION public.coach_access_overview()
RETURNS TABLE (student_id uuid, state jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.student_id, public.student_access_state(cs.student_id)
    FROM coach_students cs
   WHERE cs.coach_id = auth.uid() AND cs.status = 'active';
$$;

-- Aluno só com "acesso à plataforma": não gera alertas de acompanhamento.
CREATE OR REPLACE FUNCTION public.student_alerts_muted(p_coach uuid, p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM student_subscriptions ss
     WHERE ss.student_id = p_student AND ss.coach_id = p_coach
       AND ss.status IN ('active', 'pending', 'overdue') AND ss.plan_kind = 'access'
  );
$$;

-- ── 7) Permissões das funções ──────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_paid_charge(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paid_charge(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.plan_quote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_quote(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_plan_quotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_plan_quotes() TO authenticated;
REVOKE ALL ON FUNCTION public.create_plan_charge(uuid, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_plan_charge(uuid, text, date, text, text) TO authenticated, service_role;  -- confere coach/admin por dentro
REVOKE ALL ON FUNCTION public.coach_settle_charge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_settle_charge(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.student_access_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_access_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_status() TO authenticated;
REVOKE ALL ON FUNCTION public.my_access_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_blocked() TO authenticated;
REVOKE ALL ON FUNCTION public.coach_access_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_access_overview() TO authenticated;
REVOKE ALL ON FUNCTION public.student_alerts_muted(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_alerts_muted(uuid, uuid) TO authenticated, service_role;

-- ── 8) Protocolo: aluno com acesso pausado não lê a dieta/treino ───────────
-- (a tela já mostra o bloqueio; aqui é a garantia no banco). Coach e admin não mudam.
DROP POLICY IF EXISTS "Coach and student can read protocols" ON public.protocols;
CREATE POLICY "Coach and student can read protocols" ON public.protocols
  FOR SELECT TO authenticated
  USING (
    coach_id = auth.uid()
    OR (student_id = auth.uid() AND NOT (SELECT public.my_access_blocked()))
    OR public.has_role(auth.uid(), 'admin')
  );

-- ── 9) Parceira vira vitalícia (isenta) ao ser ativada ─────────────────────
CREATE OR REPLACE FUNCTION public.partner_profiles_make_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE coach_students
       SET is_exempt = true, exempt_reason = 'partner'
     WHERE coach_id = NEW.coach_id AND student_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_profiles_make_exempt ON public.partner_profiles;
CREATE TRIGGER partner_profiles_make_exempt
  AFTER INSERT OR UPDATE OF status ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.partner_profiles_make_exempt();

-- Parceiras já ativas hoje passam a vitalícias.
UPDATE public.coach_students cs
   SET is_exempt = true, exempt_reason = 'partner'
  FROM public.partner_profiles pp
 WHERE pp.status = 'active' AND cs.coach_id = pp.coach_id AND cs.student_id = pp.user_id
   AND cs.is_exempt = false;
UPDATE public.coach_students SET exempt_reason = 'manual'
 WHERE is_exempt AND exempt_reason IS NULL;

-- ── 10) Fila de prioridades: sem alertas de acompanhamento para "só acesso" ─
DROP VIEW IF EXISTS public.coach_priority_queue;
CREATE VIEW public.coach_priority_queue
WITH (security_invoker = true) AS
SELECT cfa.id AS source_id,
    cfa.coach_id,
    cfa.student_id,
    'fatigue'::text AS source,
    cfa.severity,
        CASE cfa.alert_type
            WHEN 'high_rpe' THEN 'RPE alto'
            WHEN 'poor_sleep' THEN 'Sono ruim'
            WHEN 'stagnation' THEN 'Estagnação'
            WHEN 'low_adherence' THEN 'Baixa adesão'
            WHEN 'overreaching' THEN 'Overreaching'
            WHEN 'volume_mrv' THEN 'Volume acima do limite'
            WHEN 'insufficient_data' THEN 'Dados insuficientes'
            ELSE cfa.alert_type
        END AS title,
    cfa.message,
    cfa.suggestion AS suggested_action,
    cfa.context,
    cfa.created_at AS reference_at
   FROM coach_fatigue_alerts cfa
  WHERE cfa.is_read = false AND cfa.resolved_at IS NULL
    AND NOT public.student_alerts_muted(cfa.coach_id, cfa.student_id)
UNION ALL
 SELECT ci.id AS source_id,
    cs.coach_id,
    ci.student_id,
    'checkin_urgent'::text AS source,
    'critical'::text AS severity,
    'Atenção prioritária solicitada'::text AS title,
    COALESCE(NULLIF(btrim(ci.payload ->> 'evento_relevante_desc'), ''), 'O aluno marcou este check-in como prioritário.') AS message,
    'Abrir feedback do check-in'::text AS suggested_action,
    '{}'::jsonb AS context,
    ci.submitted_at AS reference_at
   FROM check_ins ci
   JOIN coach_students cs ON cs.student_id = ci.student_id AND cs.status = 'active'
  WHERE (ci.payload ->> 'atencao_urgente') = 'Sim'
    AND COALESCE(btrim(ci.coach_feedback), '') = ''
    AND ci.submitted_at = (( SELECT max(ci2.submitted_at)
           FROM check_ins ci2
          WHERE ci2.student_id = ci.student_id))
    AND NOT public.student_alerts_muted(cs.coach_id, ci.student_id)
UNION ALL
 SELECT cf.id AS source_id,
    cf.coach_id,
    cf.student_id,
    'payment_overdue'::text AS source,
        CASE WHEN (CURRENT_DATE - cf.due_date) > 7 THEN 'critical' ELSE 'warning' END AS severity,
    'Cobrança em atraso'::text AS title,
    ((((cf.description || ' — R$ ') || to_char(cf.amount, 'FM999999990.00')) || ' — ') || ((CURRENT_DATE - cf.due_date)::text)) || ' dia(s) de atraso' AS message,
    'Abrir Financeiro'::text AS suggested_action,
    '{}'::jsonb AS context,
    cf.due_date::timestamp with time zone AS reference_at
   FROM coach_finances cf
  WHERE cf.status = 'pending' AND cf.due_date IS NOT NULL AND cf.due_date < CURRENT_DATE AND NOT (EXISTS ( SELECT 1
           FROM coach_students cs
          WHERE cs.student_id = cf.student_id AND cs.coach_id = cf.coach_id
            AND (cs.is_exempt = true OR cs.access_granted_until >= CURRENT_DATE)));

GRANT SELECT ON public.coach_priority_queue TO authenticated;
GRANT SELECT ON public.coach_priority_queue TO service_role;
