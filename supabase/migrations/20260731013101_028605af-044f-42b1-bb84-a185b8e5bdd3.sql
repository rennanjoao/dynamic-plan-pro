CREATE OR REPLACE VIEW public.coach_priority_queue AS
  SELECT cfa.id AS source_id,
     cfa.coach_id,
     cfa.student_id,
     'fatigue'::text AS source,
     cfa.severity,
     CASE cfa.alert_type
       WHEN 'high_rpe'::text THEN 'RPE alto'::text
       WHEN 'poor_sleep'::text THEN 'Sono ruim'::text
       WHEN 'stagnation'::text THEN 'Estagnação'::text
       WHEN 'low_adherence'::text THEN 'Baixa adesão'::text
       WHEN 'overreaching'::text THEN 'Overreaching'::text
       ELSE cfa.alert_type
     END AS title,
     cfa.message,
     cfa.suggestion AS suggested_action,
     cfa.created_at AS reference_at
  FROM public.coach_fatigue_alerts cfa
  WHERE cfa.is_read = false AND cfa.resolved_at IS NULL
UNION ALL
  SELECT ci.id AS source_id,
     ci.coach_id,
     ci.student_id,
     'checkin_urgent'::text AS source,
     'critical'::text AS severity,
     'Atenção prioritária solicitada'::text AS title,
     COALESCE(NULLIF(btrim(ci.payload->>'evento_relevante_desc'), ''),
              'O aluno marcou este check-in como prioritário.') AS message,
     'Abrir feedback do check-in'::text AS suggested_action,
     ci.submitted_at AS reference_at
  FROM public.check_ins ci
  WHERE ci.coach_id IS NOT NULL
    AND ci.payload->>'atencao_urgente' = 'Sim'
    AND COALESCE(btrim(ci.coach_feedback), '') = ''
    AND ci.submitted_at = (
      SELECT max(ci2.submitted_at) FROM public.check_ins ci2 WHERE ci2.student_id = ci.student_id
    );

GRANT SELECT ON public.coach_priority_queue TO authenticated;