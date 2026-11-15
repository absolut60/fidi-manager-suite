-- Nessun documento o avanzamento del contatore rimane dopo ROLLBACK.
BEGIN;
DO $test$
DECLARE valori text[]; assegnata public.linea_preventivo;
BEGIN
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO valori
  FROM pg_enum e WHERE e.enumtypid='public.linea_preventivo'::regtype;
  IF valori IS DISTINCT FROM ARRAY['sistema_made','showroom','edilizia','fotovoltaico'] THEN
    RAISE EXCEPTION 'Valori enum linea inattesi: %', valori;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='preventivi' AND column_name='linea' AND udt_name='linea_preventivo' AND is_nullable='NO' AND column_default='''sistema_made''::linea_preventivo') THEN
    RAISE EXCEPTION 'Colonna/default linea non corretti';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='preventivi' AND indexname='preventivi_linea_idx') THEN
    RAISE EXCEPTION 'Indice linea mancante';
  END IF;
  IF EXISTS (SELECT 1 FROM public.preventivi WHERE linea IS DISTINCT FROM 'sistema_made'::public.linea_preventivo) THEN
    RAISE EXCEPTION 'Documenti esistenti fuori da Sistema MADE';
  END IF;
  -- Numero esplicito: isola il default linea dal gate del contatore, senza modificarlo.
  INSERT INTO public.preventivi(numero,titolo) VALUES ('FM72-LINEA-TEST-' || gen_random_uuid()::text,'FM72 TEST default linea') RETURNING linea INTO assegnata;
  IF assegnata IS DISTINCT FROM 'sistema_made'::public.linea_preventivo THEN
    RAISE EXCEPTION 'Default INSERT errato: %', assegnata;
  END IF;
END;
$test$;
ROLLBACK;