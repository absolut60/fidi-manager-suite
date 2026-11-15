-- FM75 F3d: totali dell'ordine da calcola_riepilogo_iva.
-- A) ordinaria IVA 22 con decimali: identico al vecchio conto (imp × iva_perc, ROUND 2).
-- B) esempio agevolata_10_bs: totale 8.848.
-- Il blocco termina SEMPRE con eccezione (= rollback). Esito atteso: "ESITO (rollback): OK ord=... bs=8000.00/848.00/8848.00".
DO $$
DECLARE p1 uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid();
  o1 uuid; o2 uuid; sel jsonb; v record; w record; vecchio_iva numeric; vecchio_tot numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1),'role','authenticated','aal','aal2')::text, true);
  INSERT INTO public.preventivi (id,tipo,data,titolo,iva_perc) VALUES (p1,'preventivo',CURRENT_DATE,'F3d ord',22);
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b1,p1,'B',0);
  INSERT INTO public.righe_preventivo (blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,ordine) VALUES
   (b1,'manuale','a',1,123.45,123.45,1),(b1,'manuale','b',1,67.89,67.89,2),(b1,'manuale','c',1,0.05,0.05,3),(b1,'manuale','d',1,333.33,333.33,4);
  SELECT jsonb_build_array(jsonb_build_object('blocco_id',b1,'righe',jsonb_agg(jsonb_build_object('riga_id',id,'quantita',1)))) INTO sel FROM public.righe_preventivo WHERE blocco_id=b1;
  o1 := public.trasforma_preventivo_in_ordine(p1, sel);
  SELECT totale_imponibile, iva_importo, totale INTO v FROM public.preventivi WHERE id=o1;
  vecchio_iva := ROUND(v.totale_imponibile * 22 / 100.0, 2); vecchio_tot := ROUND(v.totale_imponibile * 1.22, 2);
  IF v.totale_imponibile <> 524.72 OR v.iva_importo <> vecchio_iva OR v.totale <> vecchio_tot THEN
    RAISE EXCEPTION 'ESITO (rollback): DIVERSO ordinaria %/% vs %/%', v.iva_importo, v.totale, vecchio_iva, vecchio_tot; END IF;

  INSERT INTO public.preventivi (id,tipo,data,titolo,iva_perc,regime_iva) VALUES (p2,'preventivo',CURRENT_DATE,'F3d bs',22,'agevolata_10_bs');
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b2,p2,'B',0);
  INSERT INTO public.righe_preventivo (blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,ordine,bene_significativo) VALUES
   (b2,'manuale','posa',1,2000,2000,1,false),(b2,'manuale','piastrelle',1,1500,1500,2,false),(b2,'manuale','colla',1,300,300,3,false),
   (b2,'manuale','sanitari',1,2500,2500,4,true),(b2,'manuale','rubinetteria',1,1700,1700,5,true);
  SELECT jsonb_build_array(jsonb_build_object('blocco_id',b2,'righe',jsonb_agg(jsonb_build_object('riga_id',id,'quantita',1)))) INTO sel FROM public.righe_preventivo WHERE blocco_id=b2;
  o2 := public.trasforma_preventivo_in_ordine(p2, sel);
  SELECT totale_imponibile, iva_importo, totale INTO w FROM public.preventivi WHERE id=o2;
  IF w.totale <> 8848 OR w.iva_importo <> 848 THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSO bs %/%/%', w.totale_imponibile, w.iva_importo, w.totale; END IF;
  RAISE EXCEPTION 'ESITO (rollback): OK ord=%/%/% bs=%/%/%', v.totale_imponibile, v.iva_importo, v.totale, w.totale_imponibile, w.iva_importo, w.totale;
END $$;
