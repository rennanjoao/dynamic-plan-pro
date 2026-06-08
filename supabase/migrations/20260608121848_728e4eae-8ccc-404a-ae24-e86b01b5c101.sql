ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS arm_relaxed numeric;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS arm_flexed numeric;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS arm_relaxed numeric;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS arm_flexed numeric;