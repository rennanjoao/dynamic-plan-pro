-- ════════════════════════════════════════════════════════════════════════════
-- Auditoria — Pacote 2 (depende da 0005: is_privileged_request,
-- is_active_coach_of, guard_coach_students_write)
-- Idempotente e sem apagar políticas existentes (exceto a de listagem do
-- bucket público exercicios-gifs, ver item 4).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Protocolo só para aluno com vínculo ATIVO (C9) ──────────────────────
-- save_protocol_with_plan (SECURITY DEFINER) e o insert direto de "copiar
-- protocolo" conferiam só o coach — dava para publicar no app de uma aluna de
-- outro coach. Trigger vale dentro e fora da função.
-- Permitido para usuário comum: modelo (student_id nulo ou = próprio coach),
-- a própria aluna, ou coach com vínculo ativo.
CREATE OR REPLACE FUNCTION public.guard_protocol_student_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.student_id IS NULL
     OR NEW.student_id = auth.uid()
     OR NEW.student_id = NEW.coach_id
     OR public.is_active_coach_of(NEW.student_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Este aluno não está vinculado a você (vínculo ativo necessário)'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_protocol_student_link ON public.protocols;
CREATE TRIGGER trg_guard_protocol_student_link
  BEFORE INSERT OR UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.guard_protocol_student_link();

DROP TRIGGER IF EXISTS trg_guard_coach_plans_student_link ON public.coach_plans;
CREATE TRIGGER trg_guard_coach_plans_student_link
  BEFORE INSERT OR UPDATE ON public.coach_plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_protocol_student_link();

-- ─── 2) "Desfazer" desvínculo por 10 minutos (C4) ──────────────────────────
-- A 0005 impediu o coach de reativar vínculo. Para não punir clique errado,
-- o próprio coach pode reativar até 10 min depois de desvincular.
ALTER TABLE public.coach_students ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
-- Quem desvinculou: só o PRÓPRIO coach que clicou pode desfazer. Se foi o
-- servidor (aluna trocou de coach) ou o admin, fica nulo e não há desfazer.
ALTER TABLE public.coach_students ADD COLUMN IF NOT EXISTS deactivated_by uuid;

CREATE OR REPLACE FUNCTION public.guard_coach_students_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Marca quando o vínculo foi encerrado (vale para todos, inclusive admin).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM 'active' AND OLD.status = 'active' THEN
      NEW.deactivated_at := now();
      NEW.deactivated_by := CASE WHEN coalesce(auth.role(), '') = 'authenticated' THEN auth.uid() END;
    ELSIF NEW.status = 'active' THEN
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
    END IF;
  END IF;

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
    IF OLD.coach_id = auth.uid()
       AND OLD.deactivated_by = auth.uid()
       AND OLD.deactivated_at IS NOT NULL
       AND OLD.deactivated_at > now() - interval '10 minutes' THEN
      RETURN NEW; -- desfazer recente
    END IF;
    RAISE EXCEPTION 'coach_students: reativação de vínculo só pelo aluno ou pelo admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3) Nome do coach para a área do aluno (C3) ────────────────────────────
-- Antes o nome "Rennan Gonçalves" estava fixo nas telas do aluno.
CREATE OR REPLACE FUNCTION public.get_my_coach_public_info()
RETURNS TABLE (coach_id uuid, full_name text, team_name text, cref text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.coach_id, p.full_name, p.team_name, p.cref
  FROM public.coach_students cs
  LEFT JOIN public.profiles p ON p.user_id = cs.coach_id
  WHERE cs.student_id = auth.uid()
    AND cs.status = 'active'
  ORDER BY cs.updated_at DESC NULLS LAST
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_coach_public_info() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_coach_public_info() TO authenticated, service_role;

-- ─── 4) GIFs de exercício: listagem só para admin (alerta do Lovable) ──────
-- O bucket continua PÚBLICO: os GIFs abrem normalmente pelo link público
-- (getPublicUrl), que não passa por estas regras. O app nunca lista o bucket.
DROP POLICY IF EXISTS "exercicios_gifs_public_read" ON storage.objects;
DROP POLICY IF EXISTS exercicios_gifs_admin_read ON storage.objects;
CREATE POLICY exercicios_gifs_admin_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercicios-gifs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
