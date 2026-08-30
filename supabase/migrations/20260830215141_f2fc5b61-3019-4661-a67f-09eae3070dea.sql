ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS student_first_viewed_at timestamptz;

CREATE INDEX IF NOT EXISTS protocols_student_first_viewed_idx
  ON public.protocols (student_id, student_first_viewed_at);

CREATE OR REPLACE FUNCTION public.mark_protocol_viewed(p_protocol_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.protocols
     SET student_first_viewed_at = now()
   WHERE id = p_protocol_id
     AND student_id = auth.uid()
     AND student_first_viewed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_protocol_viewed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_protocol_viewed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_protocol_viewed(uuid) TO authenticated;