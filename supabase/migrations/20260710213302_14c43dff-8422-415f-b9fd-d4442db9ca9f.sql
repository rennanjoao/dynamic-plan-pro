CREATE TABLE public.protocol_change_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocol_id UUID NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  coach_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  seen_item_indexes JSONB NOT NULL DEFAULT '[]'::jsonb,
  seen_at TIMESTAMPTZ
);

CREATE INDEX idx_protocol_change_events_student ON public.protocol_change_events (student_id, seen_at);
CREATE INDEX idx_protocol_change_events_protocol ON public.protocol_change_events (protocol_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.protocol_change_events TO authenticated;
GRANT ALL ON public.protocol_change_events TO service_role;

ALTER TABLE public.protocol_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach and student can read change events"
  ON public.protocol_change_events FOR SELECT
  TO authenticated
  USING (
    coach_id = auth.uid()
    OR student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coach can insert own change events"
  ON public.protocol_change_events FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Student can mark change events as seen"
  ON public.protocol_change_events FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND protocol_id = (SELECT pce.protocol_id FROM public.protocol_change_events pce WHERE pce.id = protocol_change_events.id)
    AND coach_id = (SELECT pce.coach_id FROM public.protocol_change_events pce WHERE pce.id = protocol_change_events.id)
    AND changes = (SELECT pce.changes FROM public.protocol_change_events pce WHERE pce.id = protocol_change_events.id)
  );