-- ════════════════════════════════════════════════════════════════════════════
-- Auditoria 17/11/2026 — Pacote 1 (itens 3, 4 e 5)
--
-- Escrita para ser SEGURA mesmo que o banco de produção tenha políticas além
-- das que existem no repositório (há divergência conhecida entre os dois):
--   • Não apaga nenhuma política existente.
--   • Usa políticas RESTRICTIVE (somam-se com AND às existentes) e triggers,
--     que valem independentemente de quais políticas permissivas existam.
--   • Idempotente: pode rodar mais de uma vez sem erro.
--
-- Contexto privilegiado (sem efeito das travas abaixo): service_role (edge
-- functions), conexões sem JWT (migrations / SQL editor) e admins.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- True quando a requisição NÃO vem de um usuário comum do app
-- (service_role, migration/SQL editor) ou quando o usuário é admin.
CREATE OR REPLACE FUNCTION public.is_privileged_request()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') NOT IN ('authenticated', 'anon')
      OR coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false);
$$;
REVOKE ALL ON FUNCTION public.is_privileged_request() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_privileged_request() TO authenticated, service_role;

-- True quando o usuário logado é o coach com vínculo ATIVO com o aluno.
CREATE OR REPLACE FUNCTION public.is_active_coach_of(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_students cs
    WHERE cs.student_id = p_student_id
      AND cs.coach_id = auth.uid()
      AND cs.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_coach_of(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_active_coach_of(uuid) TO authenticated, service_role;

-- ─── Item 3a — vínculo coach↔aluno só pelo fluxo oficial ────────────────────
-- Antes: a política cs_coach_insert_own deixava um coach criar vínculo com
-- QUALQUER aluno, e a de UPDATE deixava reativar um vínculo encerrado — e um
-- vínculo dá acesso a anamnese, check-ins e fotos.
-- Agora (para usuário comum, inclusive coach):
--   • INSERT direto é recusado — o vínculo nasce no servidor
--     (link-coach-student / redeem-access-code, com service_role) ou pelo admin.
--   • UPDATE não pode trocar coach_id/student_id nem reativar um vínculo
--     inativo. Continua permitido: inativar, isentar, ajustar prazos.
CREATE OR REPLACE FUNCTION public.guard_coach_students_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'coach_students: vínculo só pode ser criado pelo fluxo do aluno ou pelo admin'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'coach_students: não é permitido trocar coach ou aluno do vínculo'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'coach_students: reativação de vínculo só pelo aluno ou pelo admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_coach_students_write ON public.coach_students;
CREATE TRIGGER trg_guard_coach_students_write
  BEFORE INSERT OR UPDATE ON public.coach_students
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_students_write();

-- ─── Item 3b — anamnese e check-ins: só aluno, coach ATIVO ou admin ─────────
-- Antes: bastava existir um vínculo (mesmo inativo) ou o coach_id antigo da
-- linha — ex-coaches continuavam lendo e editando dados de saúde.
-- RESTRICTIVE = vale em conjunto com qualquer política já existente.
DROP POLICY IF EXISTS anamnesis_restrict_select_active_coach ON public.anamnesis;
CREATE POLICY anamnesis_restrict_select_active_coach
  ON public.anamnesis AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS anamnesis_restrict_update_active_coach ON public.anamnesis;
CREATE POLICY anamnesis_restrict_update_active_coach
  ON public.anamnesis AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS check_ins_restrict_select_active_coach ON public.check_ins;
CREATE POLICY check_ins_restrict_select_active_coach
  ON public.check_ins AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS check_ins_restrict_update_active_coach ON public.check_ins;
CREATE POLICY check_ins_restrict_update_active_coach
  ON public.check_ins AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    student_id = auth.uid()
    OR public.is_active_coach_of(student_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ─── Item 4 — teste grátis e bloqueio só mudam pelo admin/servidor ──────────
-- Antes: "Users can update their own profile" não restringia colunas, então o
-- próprio coach podia estender trial_ends_at ou limpar blocked_until.
-- Agora, para usuário comum, essas duas colunas ficam como estavam (UPDATE) ou
-- nascem vazias (INSERT). Não gera erro: o resto do perfil salva normalmente.
CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.trial_ends_at := NULL;
    NEW.blocked_until := NULL;
  ELSE
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.blocked_until := OLD.blocked_until;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_billing_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_billing_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_billing_columns();

-- ─── Item 5 — status de bloqueio para a área do aluno ───────────────────────
-- Antes: a tela do aluno descobria o coach por coach_plans (cópia legada) e
-- dependia de conseguir ler o perfil do coach. Agora uma função única,
-- restrita ao próprio aluno, usa o vínculo oficial (coach_students ativo).
CREATE OR REPLACE FUNCTION public.get_my_coach_access_status()
RETURNS TABLE (coach_id uuid, coach_blocked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.coach_id,
         (p.blocked_until IS NOT NULL AND p.blocked_until > now()) AS coach_blocked
  FROM public.coach_students cs
  LEFT JOIN public.profiles p ON p.user_id = cs.coach_id
  WHERE cs.student_id = auth.uid()
    AND cs.status = 'active'
  ORDER BY cs.updated_at DESC NULLS LAST
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_coach_access_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_access_status() TO authenticated, service_role;
