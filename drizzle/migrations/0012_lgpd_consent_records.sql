-- LGPD: registro do consentimento do aluno (dados de saúde e fotos).
-- Tabela NOVA; nenhuma tabela, coluna ou política existente é alterada.
-- Cada aceite vira uma linha imutável (sem UPDATE/DELETE pelo app): quem,
-- quando (hora do servidor), qual versão do texto e o texto exibido. Para menor
-- de 18 anos, guarda também o nome do responsável que autorizou.

CREATE TABLE IF NOT EXISTS public.consent_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'health_data_photos',
  version       text NOT NULL,
  text_shown    text NOT NULL,
  guardian_name text,
  user_agent    text,
  accepted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_records_user_idx ON public.consent_records (user_id, kind, version);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- O próprio aluno registra e consulta o seu aceite.
CREATE POLICY "consent_insert_own" ON public.consent_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "consent_select_own" ON public.consent_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- O coach vinculado e o admin podem consultar (prova do aceite).
CREATE POLICY "consent_select_coach" ON public.consent_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.student_id = consent_records.user_id AND cs.coach_id = auth.uid()
  ));

CREATE POLICY "consent_select_admin" ON public.consent_records
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- accepted_at vem sempre do servidor, nunca do aparelho.
CREATE OR REPLACE FUNCTION public.consent_records_server_time()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.accepted_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS consent_records_server_time ON public.consent_records;
CREATE TRIGGER consent_records_server_time
  BEFORE INSERT ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_server_time();