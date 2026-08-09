-- F1: RLS aditiva
CREATE POLICY "Students can view their own charges"
ON public.coach_finances FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Coaches can view their own platform charges"
ON public.platform_billing_charges FOR SELECT TO authenticated
USING (coach_id = auth.uid());

-- F2: forma de pagamento + isenção
ALTER TABLE public.coach_finances ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.coach_finances ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.coach_finances ADD COLUMN IF NOT EXISTS checkout_created_at timestamptz;
ALTER TABLE public.coach_students ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false;

-- F5 / Onboarding: colunas no perfil
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS infinitepay_handle text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_seen_at timestamptz;

-- F3: nova branch payment_overdue na fila de prioridade
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
    )
UNION ALL
  SELECT cf.id AS source_id,
     cf.coach_id,
     cf.student_id,
     'payment_overdue'::text AS source,
     CASE WHEN (CURRENT_DATE - cf.due_date) > 7 THEN 'critical'::text ELSE 'warning'::text END AS severity,
     'Cobrança em atraso'::text AS title,
     cf.description || ' — R$ ' || to_char(cf.amount, 'FM999999990.00')
       || ' — ' || (CURRENT_DATE - cf.due_date)::text || ' dia(s) de atraso' AS message,
     'Abrir Financeiro'::text AS suggested_action,
     cf.due_date::timestamptz AS reference_at
  FROM public.coach_finances cf
  WHERE cf.status = 'pending'
    AND cf.due_date IS NOT NULL
    AND cf.due_date < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.coach_students cs
      WHERE cs.student_id = cf.student_id
        AND cs.coach_id = cf.coach_id
        AND cs.is_exempt = true
    );

GRANT SELECT ON public.coach_priority_queue TO authenticated;