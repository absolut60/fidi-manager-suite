-- FM75 F3b: il gemello SQL calcola_riepilogo_iva coincide con riepilogoIva sull'esempio di riferimento.
-- Il blocco termina SEMPRE con eccezione (= rollback, nessun dato resta).
-- Esito atteso: "ESITO (rollback): OK 10:7600.00/760.00,22:400.00/88.00".
DO $$
DECLARE p uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); esito text;
BEGIN
  INSERT INTO public.preventivi (id,tipo,data,titolo,regime_iva,iva_perc) VALUES (p,'preventivo',CURRENT_DATE,'FM75 F3b prova','agevolata_10_bs',22);
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b,p,'B',0);
  INSERT INTO public.righe_preventivo (blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,ordine,bene_significativo) VALUES
   (b,'manuale','posa',1,2000,2000,1,false),(b,'manuale','piastrelle',1,1500,1500,2,false),(b,'manuale','colla',1,300,300,3,false),
   (b,'manuale','sanitari',1,2500,2500,4,true),(b,'manuale','rubinetteria',1,1700,1700,5,true);
  SELECT string_agg(aliquota||':'||imponibile||'/'||iva, ',' ORDER BY aliquota) INTO esito FROM public.calcola_riepilogo_iva(p);
  IF esito IS DISTINCT FROM '10:7600.00/760.00,22:400.00/88.00' THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSO %', esito; END IF;
  RAISE EXCEPTION 'ESITO (rollback): OK %', esito;
END $$;
