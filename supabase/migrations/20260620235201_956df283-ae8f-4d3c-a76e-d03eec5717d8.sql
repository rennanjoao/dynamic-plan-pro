ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pix_holder_name text,
  ADD COLUMN IF NOT EXISTS pix_city text;