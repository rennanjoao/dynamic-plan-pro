
CREATE TABLE public.protocol_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  student_id UUID,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','resolved_with_warnings','error')),
  anomalies_count INTEGER NOT NULL DEFAULT 0,
  resolved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pil_coach_created ON public.protocol_import_logs (coach_id, created_at DESC);

GRANT SELECT, INSERT ON public.protocol_import_logs TO authenticated;
GRANT ALL ON public.protocol_import_logs TO service_role;

ALTER TABLE public.protocol_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own import logs"
  ON public.protocol_import_logs FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach can insert own import logs"
  ON public.protocol_import_logs FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());
