-- FM75 F2a: l'ordine generato conserva stampabile riga per riga.
-- Eseguire con privilegi di scrittura: il blocco termina SEMPRE con eccezione (= rollback, nessun dato resta).
-- Esito atteso nel messaggio: "ESITO (rollback): visibile=true,nascosta=false".
DO $$
DECLARE p uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); o uuid; esito text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1),'role','authenticated','aal','aal2')::text, true);
  INSERT INTO public.preventivi (id,tipo,data,titolo) VALUES (p,'preventivo',CURRENT_DATE,'FM75 prova');
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b,p,'B',0);
  INSERT INTO public.righe_preventivo (id,blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,ordine,stampabile)
   VALUES (r1,b,'manuale','visibile',2,10,20,1,true),(r2,b,'manuale','nascosta',3,5,15,2,false);
  o := public.trasforma_preventivo_in_ordine(p, jsonb_build_array(jsonb_build_object('blocco_id',b,'righe',jsonb_build_array(
        jsonb_build_object('riga_id',r1,'quantita',2),jsonb_build_object('riga_id',r2,'quantita',3)))));
  SELECT string_agg(r.descrizione||'='||r.stampabile, ',' ORDER BY r.ordine) INTO esito
    FROM public.righe_preventivo r JOIN public.blocchi_preventivo bb ON bb.id=r.blocco_id WHERE bb.preventivo_id=o;
  RAISE EXCEPTION 'ESITO (rollback): %', esito;
END $$;
