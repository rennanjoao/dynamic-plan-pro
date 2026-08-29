-- ============================================================================
-- FIX (auditoria de check-in/alertas — 2026-08-28)
--
-- check_ins.coach_id nunca era preenchido no INSERT feito pelo aluno
-- (src/pages/CheckIn.tsx), pois não existia trigger equivalente ao que já
-- protege coach_finances via handle_anamnesis_billing(). Como a branch
-- 'checkin_urgent' da view coach_priority_queue exigia `ci.coach_id IS NOT
-- NULL`, nenhum check-in com "Precisa de atenção prioritária do coach
-- agora? = Sim" jamais aparecia na Fila de Prioridade do coach — a coluna
-- estava sempre NULL.
--
-- Esta migração:
--   1) Cria um trigger BEFORE INSERT em check_ins que preenche coach_id a
--      partir do vínculo ativo em coach_students, no mesmo padrão já usado
--      por handle_anamnesis_billing() (20260607211833).
--   2) Faz backfill dos check_ins existentes com coach_id NULL.
--   3) Reescreve coach_priority_queue para resolver o coach da branch
--      'checkin_urgent' via JOIN com coach_students (a mesma fonte que a
--      política de RLS já usa), em vez de depender só da coluna. Isso
--      corrige o histórico imediatamente — sem esperar o backfill — e
--      também cobre o caso de reatribuição de aluno para outro coach
--      (a fila sempre aponta para o coach ativo atual, nunca para um
--      coach_id antigo congelado na linha do check-in).
--
-- As branches 'fatigue' e 'payment_overdue' da view são reproduzidas
-- byte-a-byte a partir da versão anterior (20260811014105) — só a branch
-- 'checkin_urgent' muda.
-- ============================================================================

-- 1) Trigger de preenchimento automático de check_ins.coach_id
CREATE OR REPLACE FUNCTION public.set_checkin_coach_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.coach_id IS NULL THEN
    SELECT coach_id INTO NEW.coach_id
    FROM coach_students
    WHERE student_id = NEW.student_id AND status = 'active'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_checkin_coach_id ON public.check_ins;
CREATE TRIGGER trg_set_checkin_coach_id
  BEFORE INSERT ON public.check_ins
  FOR EACH ROW EXECUTE FUNCTION public.set_checkin_coach_id();

-- 2) Backfill dos check-ins já existentes
UPDATE public.check_ins ci
SET coach_id = cs.coach_id
FROM public.coach_students cs
WHERE ci.coach_id IS NULL
  AND cs.student_id = ci.student_id
  AND cs.status = 'active';

-- 3) coach_priority_queue: branch 'checkin_urgent' resolvida via coach_students
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
          WHERE cs.student_id = cf.student_id AND cs.coach_id = cf.coach_id AND cs.is_exempt = true));

GRANT SELECT ON public.coach_priority_queue TO authenticated;
GRANT SELECT ON public.coach_priority_queue TO service_role;
