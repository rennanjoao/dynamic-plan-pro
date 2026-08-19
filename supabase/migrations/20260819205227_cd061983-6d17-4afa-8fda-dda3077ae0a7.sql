CREATE TABLE public.prescription_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  student_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  version integer NOT NULL,
  muscle_priorities jsonb NOT NULL DEFAULT '{}'::jsonb,
  dominances text[] NOT NULL DEFAULT '{}',
  limitations text,
  visual_observations text,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, version)
);

CREATE INDEX idx_prescription_profile_versions_student
  ON public.prescription_profile_versions (student_id, version DESC);

GRANT SELECT ON public.prescription_profile_versions TO authenticated;
GRANT ALL ON public.prescription_profile_versions TO service_role;

ALTER TABLE public.prescription_profile_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assigned coach and admin can read prescription profile versions"
ON public.prescription_profile_versions
FOR SELECT
TO authenticated
USING (
  coach_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.student_id = prescription_profile_versions.student_id
      AND cs.coach_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admin can delete prescription profile versions"
ON public.prescription_profile_versions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Snapshot do estado ANTERIOR, na mesma transação do UPDATE
-- (mesmo princípio já usado em protocol_versions dentro de save_protocol_with_plan).
CREATE OR REPLACE FUNCTION public.snapshot_prescription_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.prescription_profile_versions
  WHERE student_id = OLD.student_id;

  INSERT INTO public.prescription_profile_versions (
    profile_id, student_id, coach_id, version,
    muscle_priorities, dominances, limitations, visual_observations, sources,
    changed_by, snapshot_at
  ) VALUES (
    OLD.id, OLD.student_id, OLD.coach_id, v_next,
    OLD.muscle_priorities, OLD.dominances, OLD.limitations, OLD.visual_observations, OLD.sources,
    COALESCE(auth.uid(), OLD.updated_by), now()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_prescription_profile
BEFORE UPDATE ON public.prescription_profile
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_prescription_profile();