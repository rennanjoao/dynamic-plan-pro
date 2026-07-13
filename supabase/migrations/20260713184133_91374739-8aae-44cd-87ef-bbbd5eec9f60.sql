
ALTER TABLE public.protocols ADD COLUMN IF NOT EXISTS draft_payload jsonb;

CREATE TABLE IF NOT EXISTS public.protocol_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocol_id, version)
);

CREATE INDEX IF NOT EXISTS protocol_versions_protocol_id_version_idx
  ON public.protocol_versions (protocol_id, version DESC);

GRANT SELECT, INSERT ON public.protocol_versions TO authenticated;
GRANT ALL ON public.protocol_versions TO service_role;

ALTER TABLE public.protocol_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own protocol versions"
  ON public.protocol_versions
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "Coach can insert own protocol versions"
  ON public.protocol_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'::public.app_role));
