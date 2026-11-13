-- Tutte le scritture di prova sono annullate, nessun documento persistito.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}', true);
DO $$
DECLARE an uuid; altro uuid; primo record; p uuid; a uuid; b uuid; blocco uuid; r uuid; ordine uuid; autore uuid;
BEGIN
  SELECT * INTO primo FROM public.cerca_clienti_preventivo('13380') LIMIT 1;
  IF primo.codice_gestionale IS DISTINCT FROM '13380' OR primo.ragione_sociale NOT ILIKE '%A.N.%' THEN RAISE EXCEPTION '13380 non primo'; END IF;
  an := primo.id;
  IF (SELECT condizione_pagamento_cod FROM public.dati_cliente_preventivo(an)) IS DISTINCT FROM 'RB64' THEN RAISE EXCEPTION 'RB64 assente'; END IF;
  SELECT id INTO altro FROM public.cerca_clienti_preventivo('13573') LIMIT 1;
  INSERT INTO public.preventivi(numero,tipo,cliente_id,titolo,condizione_pagamento_cod) VALUES ('TEST-R1a-P','preventivo',an,'Titolo test','RB64') RETURNING id,creato_da INTO p,autore;
  IF autore IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Default autore errato'; END IF;
  BEGIN
    INSERT INTO public.preventivi(numero,tipo,cliente_id,alternativa_di) VALUES ('TEST-R1a-X','preventivo',altro,p);
    RAISE EXCEPTION 'Altro cliente accettato';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.preventivi(numero,tipo,cliente_id,alternativa_di) VALUES ('TEST-R1a-A','preventivo',an,p) RETURNING id INTO a;
  BEGIN
    INSERT INTO public.preventivi(numero,tipo,cliente_id,alternativa_di) VALUES ('TEST-R1a-X','preventivo',an,a);
    RAISE EXCEPTION 'Alternativa di alternativa accettata';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.preventivi SET alternativa_di=id WHERE id=a;
    RAISE EXCEPTION 'Autoreferenza accettata';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.preventivi(numero,tipo,cliente_id,alternativa_di) VALUES ('TEST-R1a-B','preventivo',an,p) RETURNING id INTO b;
  UPDATE public.preventivi SET creato_da=gen_random_uuid() WHERE id=p;
  IF (SELECT creato_da FROM public.preventivi WHERE id=p) IS DISTINCT FROM autore THEN RAISE EXCEPTION 'Autore cambiato'; END IF;
  IF public.lettera_preventivo(p) <> 'A' THEN RAISE EXCEPTION 'Principale non A'; END IF;
  IF (SELECT string_agg(public.lettera_preventivo(id),',' ORDER BY created_at,id) FROM public.preventivi WHERE alternativa_di=p) <> 'B,C' THEN RAISE EXCEPTION 'Lettere alternative errate'; END IF;
  INSERT INTO public.blocchi_preventivo(preventivo_id,descrizione) VALUES (a,'Test UM1') RETURNING id INTO blocco;
  INSERT INTO public.righe_preventivo(blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,um_scelta) VALUES (blocco,'articolo_singolo','Test UM2',25.2,4.167,105.01,'um2') RETURNING id INTO r;
  ordine := public.trasforma_preventivo_in_ordine(a,jsonb_build_array(jsonb_build_object('blocco_id',blocco,'righe',jsonb_build_array(jsonb_build_object('riga_id',r,'quantita',25.2)))));
  IF (SELECT alternativa_di FROM public.preventivi WHERE id=ordine) IS NOT NULL THEN RAISE EXCEPTION 'Ordine eredita alternativa'; END IF;
  IF EXISTS (SELECT 1 FROM public.righe_preventivo WHERE riga_origine_id=r AND (quantita <> 25.2 OR prezzo_unit <> 4.167 OR um_scelta <> 'um2')) THEN RAISE EXCEPTION 'Ordine converte UM1'; END IF;
  RAISE NOTICE 'OK 13380 primo, RB64, alternative, autore, lettere e ordine UM1';
END;
$$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cb58438e-6f9c-4602-ae67-170615802a83","role":"authenticated","aal":"aal2"}', true);
DO $$ BEGIN
  BEGIN PERFORM public.cerca_clienti_preventivo('13380'); RAISE EXCEPTION 'Richiedente ricerca ammesso'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.dati_cliente_preventivo('eb8cd8a7-d64a-4f73-85c9-cc9457d32fcd'); RAISE EXCEPTION 'Richiedente dati ammesso'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'OK richiedente 42501 per entrambe';
END $$;
ROLLBACK;
SELECT count(*) AS anon_eseguibili FROM pg_proc WHERE pronamespace='public'::regnamespace AND has_function_privilege('anon',oid,'EXECUTE');