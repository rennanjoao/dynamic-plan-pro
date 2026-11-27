-- LGPD (fase 2): exclusão dos dados do aluno a pedido do próprio aluno ou do coach.
--
-- 1) Comissões de parceiros são registro financeiro: ao excluir o aluno, a linha
--    fica (com student_id = NULL) em vez de sumir junto. Antes era ON DELETE CASCADE.
-- 2) Função lgpd_delete_student_rows: apaga as linhas do aluno em TODAS as tabelas
--    públicas que têm student_id/user_id — inclusive as que não têm chave para
--    auth.users e ficariam órfãs (protocolos, avaliações posturais, insights...).
--    Mantém só os registros financeiros/administrativos da lista KEEP.
--    Só a service_role (edge function delete-student-account) pode chamar.

-- 1) partner_commissions.student_id: CASCADE -> SET NULL
DO $$
DECLARE c text;
BEGIN
  SELECT con.conname INTO c
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
  WHERE con.conrelid = 'public.partner_commissions'::regclass
    AND con.contype = 'f'
    AND att.attname = 'student_id'
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.partner_commissions DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.partner_commissions ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.partner_commissions
  ADD CONSTRAINT partner_commissions_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Apagar as linhas do aluno
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
