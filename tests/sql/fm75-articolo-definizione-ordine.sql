-- FM75 F4a: l'ordine copia fornitore/marca/codice fornitore/listino fornitore;
-- linea showroom conserva la descrizione personalizzata, sistema_made la ripristina da Gamma.
-- FM75: l'ordine conserva la linea del preventivo (showroom -> showroom, sistema_made -> sistema_made).
-- Il blocco termina SEMPRE con eccezione (= rollback). Esito atteso: "ESITO (rollback): OK ...".
DO $$
DECLARE art record; forn uuid; p1 uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid();
  p2 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); o1 uuid; o2 uuid; x record; y record; h1 record; h2 record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1),'role','authenticated','aal','aal2')::text, true);
  SELECT codice, descrizione INTO art FROM public.articoli_gamma WHERE descrizione IS NOT NULL AND descrizione <> '' LIMIT 1;
  SELECT id INTO forn FROM public.fornitori LIMIT 1;
  INSERT INTO public.preventivi (id,tipo,data,titolo,linea) VALUES (p1,'preventivo',CURRENT_DATE,'F4a showroom','showroom'),(p2,'preventivo',CURRENT_DATE,'F4a made','sistema_made');
  INSERT INTO public.blocchi_preventivo (id,preventivo_id,descrizione,ordine) VALUES (b1,p1,'B',0),(b2,p2,'B',0);
  INSERT INTO public.righe_preventivo (id,blocco_id,tipo_riga,articolo_codice,descrizione,quantita,prezzo_unit,importo,ordine,fornitore_id,marca,codice_articolo_fornitore,listino_fornitore) VALUES
   (r1,b1,'articolo_singolo',art.codice,'Variante finitura nero opaco',1,10,10,1,forn,'MarcaX','FX-123',99.5),
   (r2,b2,'articolo_singolo',art.codice,'Variante finitura nero opaco',1,10,10,1,NULL,NULL,NULL,NULL);
  o1 := public.trasforma_preventivo_in_ordine(p1, jsonb_build_array(jsonb_build_object('blocco_id',b1,'righe',jsonb_build_array(jsonb_build_object('riga_id',r1,'quantita',1)))));
  o2 := public.trasforma_preventivo_in_ordine(p2, jsonb_build_array(jsonb_build_object('blocco_id',b2,'righe',jsonb_build_array(jsonb_build_object('riga_id',r2,'quantita',1)))));
  SELECT r.* INTO x FROM public.righe_preventivo r WHERE r.riga_origine_id=r1;
  SELECT r.* INTO y FROM public.righe_preventivo r WHERE r.riga_origine_id=r2;
  SELECT p.* INTO h1 FROM public.preventivi p WHERE p.id=o1;
  SELECT p.* INTO h2 FROM public.preventivi p WHERE p.id=o2;
  IF x.fornitore_id IS DISTINCT FROM forn OR x.marca<>'MarcaX' OR x.codice_articolo_fornitore<>'FX-123' OR x.listino_fornitore<>99.5 THEN
    RAISE EXCEPTION 'ESITO (rollback): DIVERSO colonne % % % %', x.fornitore_id, x.marca, x.codice_articolo_fornitore, x.listino_fornitore; END IF;
  IF x.descrizione <> 'Variante finitura nero opaco' THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSO showroom %', x.descrizione; END IF;
  IF y.descrizione IS DISTINCT FROM art.descrizione THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSO made %', y.descrizione; END IF;
  IF h1.linea IS DISTINCT FROM 'showroom' THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSA linea ordine showroom %', h1.linea; END IF;
  IF h2.linea IS DISTINCT FROM 'sistema_made' THEN RAISE EXCEPTION 'ESITO (rollback): DIVERSA linea ordine made %', h2.linea; END IF;
  RAISE EXCEPTION 'ESITO (rollback): OK colonne=%/%/%/% showroom="%" made="%" linea=%/%', (x.fornitore_id IS NOT NULL), x.marca, x.codice_articolo_fornitore, x.listino_fornitore, x.descrizione, y.descrizione, h1.linea, h2.linea;
END $$;
