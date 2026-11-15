-- FM75 F3a: l'ordine eredita regime_iva in testata e copia bene_significativo/aliquota_iva riga per riga.
-- Il blocco termina SEMPRE con eccezione (= rollback, nessun dato resta).
-- Esito atteso: "ESITO (rollback): regime=agevolata_10_bs; bs=true/22,normale=false/<NULL>".
DO $$
DECLARE p uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); o uuid; reg text; esito text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1),'role','authenticated','aal','aal2')::text, true);
  INSERT INTO public.preventivi (id,tipo,data,titolo,regime_iva) VALUES (p,'preventivo',CURRENT_DATE,'FM75 F3a prova','agevolata_10_bs');
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b,p,'B',0);
  INSERT INTO public.righe_preventivo (id,blocco_id,tipo_riga,descrizione,quantita,prezzo_unit,importo,ordine,bene_significativo,aliquota_iva)
   VALUES (r1,b,'manuale','bs',2,10,20,1,true,22),(r2,b,'manuale','normale',3,5,15,2,false,NULL);
  o := public.trasforma_preventivo_in_ordine(p, jsonb_build_array(jsonb_build_object('blocco_id',b,'righe',jsonb_build_array(
        jsonb_build_object('riga_id',r1,'quantita',2),jsonb_build_object('riga_id',r2,'quantita',3)))));
  SELECT regime_iva::text INTO reg FROM public.preventivi WHERE id=o;
  SELECT string_agg(r.descrizione||'='||r.bene_significativo||'/'||COALESCE(r.aliquota_iva::text,'<NULL>'), ',' ORDER BY r.ordine) INTO esito
    FROM public.righe_preventivo r JOIN public.blocchi_preventivo bb ON bb.id=r.blocco_id WHERE bb.preventivo_id=o;
  RAISE EXCEPTION 'ESITO (rollback): regime=%; %', reg, esito;
END $$;
