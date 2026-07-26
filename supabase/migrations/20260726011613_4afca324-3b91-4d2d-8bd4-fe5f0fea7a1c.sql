CREATE OR REPLACE VIEW public.coach_priority_queue
WITH (security_invoker = true) AS
SELECT
  cfa.id AS source_id,
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
    ELSE cfa.alert_type
  END AS title,
  cfa.message,
  cfa.suggestion AS suggested_action,
  cfa.created_at AS reference_at
FROM public.coach_fatigue_alerts cfa
WHERE cfa.is_read = false AND cfa.resolved_at IS NULL
UNION ALL
SELECT
  pbc.id AS source_id,
  pbc.coach_id,
  NULL::uuid AS student_id,
  'billing'::text AS source,
  CASE pbc.status WHEN 'blocked' THEN 'critical' WHEN 'pending' THEN 'warning' ELSE 'info' END AS severity,
  CASE pbc.status WHEN 'blocked' THEN 'Cobrança bloqueada' ELSE 'Cobrança pendente' END AS title,
  'Período ' || pbc.period || ' — R$ ' || to_char(pbc.amount, 'FM999999990.00') AS message,
  NULL::text AS suggested_action,
  pbc.created_at AS reference_at
FROM public.platform_billing_charges pbc
WHERE pbc.status != 'paid';

GRANT SELECT ON public.coach_priority_queue TO authenticated;