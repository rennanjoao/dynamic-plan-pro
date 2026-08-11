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
    ci.coach_id,
    ci.student_id,
    'checkin_urgent'::text AS source,
    'critical'::text AS severity,
    'Atenção prioritária solicitada'::text AS title,
    COALESCE(NULLIF(btrim(ci.payload ->> 'evento_relevante_desc'), ''), 'O aluno marcou este check-in como prioritário.') AS message,
    'Abrir feedback do check-in'::text AS suggested_action,
    '{}'::jsonb AS context,
    ci.submitted_at AS reference_at
   FROM check_ins ci
  WHERE ci.coach_id IS NOT NULL AND (ci.payload ->> 'atencao_urgente') = 'Sim' AND COALESCE(btrim(ci.coach_feedback), '') = '' AND ci.submitted_at = (( SELECT max(ci2.submitted_at)
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