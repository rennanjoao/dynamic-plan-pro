-- ════════════════════════════════════════════════════════════════════════════
-- Auditoria 17/11/2026 — Pacote 1 (item 8)
-- Rascunho do PRIMEIRO protocolo de um aluno, salvo no banco.
--
-- protocol_drafts depende de protocol_id (só existe depois do 1º salvar), então
-- até hoje o rascunho de um protocolo novo vivia apenas no navegador do coach:
-- trocar de aparelho ou limpar o navegador perdia o trabalho.
-- Esta tabela é privada do coach — o aluno nunca lê daqui.
-- Uma linha por (coach, aluno); apagada quando o protocolo é salvo.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.protocol_new_drafts (
  coach_id uuid NOT NULL,
  student_id uuid NOT NULL,
  name text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_new_drafts TO authenticated;
GRANT ALL ON public.protocol_new_drafts TO service_role;

ALTER TABLE public.protocol_new_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS protocol_new_drafts_select ON public.protocol_new_drafts;
CREATE POLICY protocol_new_drafts_select
  ON public.protocol_new_drafts FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Gravar exige vínculo ATIVO com o aluno (helper criado na migration 0005).
DROP POLICY IF EXISTS protocol_new_drafts_insert ON public.protocol_new_drafts;
CREATE POLICY protocol_new_drafts_insert
  ON public.protocol_new_drafts FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.is_active_coach_of(student_id));

DROP POLICY IF EXISTS protocol_new_drafts_update ON public.protocol_new_drafts;
CREATE POLICY protocol_new_drafts_update
  ON public.protocol_new_drafts FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid() AND public.is_active_coach_of(student_id));

DROP POLICY IF EXISTS protocol_new_drafts_delete ON public.protocol_new_drafts;
CREATE POLICY protocol_new_drafts_delete
  ON public.protocol_new_drafts FOR DELETE TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_protocol_new_drafts_updated_at ON public.protocol_new_drafts;
CREATE TRIGGER update_protocol_new_drafts_updated_at
  BEFORE UPDATE ON public.protocol_new_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
