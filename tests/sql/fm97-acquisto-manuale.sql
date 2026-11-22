-- SOLO clone locale: schema tests/sql/fm96-clone-base.sql + dipendenze fixture e migrazione 0271.
-- Nessun dato reale; il test annulla tutte le righe di prova.
BEGIN;
DO $$
DECLARE p uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  o uuid; copiata public.righe_preventivo%ROWTYPE;
  u uuid := '97000000-0000-0000-0000-000000000099';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  INSERT INTO public.preventivi(id,tipo,titolo,linea) VALUES(p,'preventivo','Prova acquisto manuale','showroom');
  INSERT INTO public.fm96_visibility(ordine_id,utente) VALUES(p,u);
  INSERT INTO public.blocchi_preventivo(id,preventivo_id,descrizione,ordine) VALUES(b,p,'Prova',0);
  INSERT INTO public.righe_preventivo(id,blocco_id,tipo_riga,quantita,prezzo_unit,costo,descrizione,listino_fornitore,
    acq_sc1,acq_sc2,acq_sc3,acq_magg_perc,acq_magg_euro)
  VALUES(r,b,'manuale',10,120,878.037,'Riga manuale',100,10,5,2,3,1.5);
  o := public.trasforma_preventivo_in_ordine(p,jsonb_build_array(jsonb_build_object('blocco_id',b,'righe',jsonb_build_array(jsonb_build_object('riga_id',r,'quantita',5)))));
  SELECT * INTO STRICT copiata FROM public.righe_preventivo WHERE riga_origine_id=r;
  IF copiata.listino_fornitore <> 100 OR copiata.acq_sc1 <> 10 OR copiata.acq_sc2 <> 5 OR copiata.acq_sc3 <> 2 OR copiata.acq_magg_perc <> 3 OR copiata.acq_magg_euro <> 1.5 THEN
    RAISE EXCEPTION 'Condizioni di acquisto non copiate';
  END IF;
  IF copiata.quantita <> 5 OR copiata.prezzo_unit <> 120 OR copiata.costo <> 439.02 THEN RAISE EXCEPTION 'Convenzioni esistenti costo/quantita modificate'; END IF;
  IF copiata.blocco_id=b OR copiata.riga_origine_id<>r THEN RAISE EXCEPTION 'Riferimenti ordine errati'; END IF;
  RAISE NOTICE 'FM97 PASS: cinque condizioni UM1 copiate, costo totale proporzionale con arrotondamento SQL preesistente';
END $$;
ROLLBACK;