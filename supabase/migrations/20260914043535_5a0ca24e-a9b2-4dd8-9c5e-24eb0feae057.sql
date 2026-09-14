DO $$
DECLARE r record; v uuid; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.iscritti_whatsapp WHERE stato = 'nuovo' LOOP
    v := public.auto_collega_iscritto_whatsapp(r.id);
    IF v IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'Collegati automaticamente: %', n;
END $$;