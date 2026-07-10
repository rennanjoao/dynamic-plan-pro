DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.protocol_change_events;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;