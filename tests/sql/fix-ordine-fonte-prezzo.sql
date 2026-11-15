-- Fix 0240: trasforma_preventivo_in_ordine copia fonte_prezzo. Prova sul DB reale; l'eccezione finale annulla tutto.
-- Esito atteso: "OK_ROLLBACK [sistema_made: N righe identiche] [showroom: N righe identiche]".
DO $t$
DECLARE pv record; sel jsonb; ord uuid; n_diff int; n_righe int; tot_ok text := ''; giro int := 0; v_linea text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','30c9d579-76c3-4312-b47e-3f9f4680fc40','role','authenticated','aal','aal2')::text, true);
  FOR pv IN SELECT p.id FROM preventivi p WHERE p.tipo='preventivo'
      AND EXISTS (SELECT 1 FROM blocchi_preventivo b JOIN righe_preventivo r ON r.blocco_id=b.id WHERE b.preventivo_id=p.id AND COALESCE(r.quantita,0)-COALESCE(r.qta_ordinata,0)>0)
      ORDER BY p.created_at LIMIT 2 LOOP
    giro := giro+1;
    v_linea := CASE WHEN giro=1 THEN 'sistema_made' ELSE 'showroom' END;
    UPDATE preventivi SET linea=v_linea::linea_preventivo WHERE id=pv.id;
    UPDATE righe_preventivo r SET fonte_prezzo=CASE WHEN r.ordine::int % 2=0 THEN 'cantiere' ELSE 'manuale' END, stampabile=(r.ordine::int % 2=0), bene_significativo=true, aliquota_iva=10,
      marca='MarcaProva', codice_articolo_fornitore='CF-'||left(r.id::text,4), listino_fornitore=123.45, leva_prezzo='sconto_listino'
      FROM blocchi_preventivo b WHERE r.blocco_id=b.id AND b.preventivo_id=pv.id;
    SELECT jsonb_agg(jsonb_build_object('blocco_id',b.id,'righe',(SELECT COALESCE(jsonb_agg(jsonb_build_object('riga_id',r.id,'quantita',COALESCE(r.quantita,0)-COALESCE(r.qta_ordinata,0))),'[]') FROM righe_preventivo r WHERE r.blocco_id=b.id)))
      INTO sel FROM blocchi_preventivo b WHERE b.preventivo_id=pv.id;
    ord := trasforma_preventivo_in_ordine(pv.id, sel);
    SELECT count(*), count(*) FILTER (WHERE (o.fonte_prezzo, o.stampabile, o.bene_significativo, o.aliquota_iva, o.leva_prezzo, o.fornitore_id, o.marca, o.codice_articolo_fornitore, o.listino_fornitore, o.sconti_gamma, o.um_scelta, o.prezzo_unit)
        IS DISTINCT FROM (s.fonte_prezzo, s.stampabile, s.bene_significativo, s.aliquota_iva, s.leva_prezzo, s.fornitore_id, s.marca, s.codice_articolo_fornitore, s.listino_fornitore, s.sconti_gamma, s.um_scelta, s.prezzo_unit))
      INTO n_righe, n_diff
      FROM righe_preventivo o JOIN blocchi_preventivo bo ON bo.id=o.blocco_id JOIN righe_preventivo s ON s.id=o.riga_origine_id
      WHERE bo.preventivo_id=ord;
    IF n_righe=0 OR n_diff>0 THEN RAISE EXCEPTION 'KO % (%): righe %, differenze %', pv.id, v_linea, n_righe, n_diff; END IF;
    IF (SELECT linea::text FROM preventivi WHERE id=ord) <> v_linea THEN RAISE EXCEPTION 'KO linea ordine'; END IF;
    tot_ok := tot_ok || format('[%s: %s righe identiche] ', v_linea, n_righe);
  END LOOP;
  RAISE EXCEPTION 'OK_ROLLBACK %', tot_ok;
END $t$;
