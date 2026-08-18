ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS support_whatsapp text;

UPDATE public.profiles
SET support_whatsapp = '13991842023'
WHERE lower(email) = 'rennan.bad@hotmail.com'
   OR lower(notification_email) = 'rennan.bad@hotmail.com';