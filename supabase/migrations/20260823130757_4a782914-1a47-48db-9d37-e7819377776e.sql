DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messaggi'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messaggi;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='canali'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.canali;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='canale_membri'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.canale_membri;
  END IF;
END $$;

ALTER TABLE public.messaggi REPLICA IDENTITY FULL;