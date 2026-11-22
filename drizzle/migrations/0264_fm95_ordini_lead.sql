CREATE OR REPLACE FUNCTION public.trasforma_preventivo_in_ordine(p_preventivo_id uuid, p_selezione jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev public.preventivi%ROWTYPE;
  v_anno integer;
  v_suffix text;
  v_num integer;
  v_numero text;
  v_ordine_id uuid;
  v_tentativi integer := 0;
  v_blocco jsonb;
  v_riga jsonb;
  v_src_blocco public.blocchi_preventivo%ROWTYPE;
  v_src_riga public.righe_preventivo%ROWTYPE;
  v_new_blocco_id uuid;
  v_qta numeric;
  v_residuo numeric;
  v_ratio numeric;
  v_ord integer;
BEGIN
  IF NOT (public.auth_mfa_ok() AND public.auth_vede_preventivo_id(p_preventivo_id)) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT * INTO v_prev FROM public.preventivi WHERE id = p_preventivo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preventivo non trovato'; END IF;
  IF v_prev.tipo <> 'preventivo' THEN RAISE EXCEPTION 'Il documento non è un preventivo'; END IF;
  IF v_prev.chiuso_at IS NOT NULL THEN RAISE EXCEPTION 'Il preventivo è chiuso: non è più trasformabile in ordine'; END IF;
  v_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_suffix := lpad((v_anno % 100)::text, 2, '0');
  LOOP
    v_tentativi := v_tentativi + 1;
    BEGIN
      v_num := public.prossimo_numero_ordine(v_anno);
      v_numero := 'ORD-' || v_num::text || '/' || v_suffix;
      -- FM75: l'ordine conserva la linea del preventivo; ometterla farebbe scattare il default 'sistema_made'.
      INSERT INTO public.preventivi (
        tipo, numero, data, cliente_id, agente_codice, cantiere_id, filiale,
        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di, regime_iva, linea, store_id, listino_rif, macrocategoria_rif, categoria_rif, lead_id
      ) VALUES (
        'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL, v_prev.regime_iva, v_prev.linea, v_prev.store_id, v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif, v_prev.lead_id
      ) RETURNING id INTO v_ordine_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tentativi >= 5 THEN RAISE EXCEPTION 'Impossibile generare un numero ordine univoco'; END IF;
    END;
  END LOOP;
  INSERT INTO public.preventivi_note (preventivo_id, titolo, testo, ordine)
    SELECT v_ordine_id, titolo, testo, ordine FROM public.preventivi_note WHERE preventivo_id = v_prev.id;
  v_ord := 0;
  FOR v_blocco IN SELECT * FROM jsonb_array_elements(COALESCE(p_selezione, '[]'::jsonb))
  LOOP
    SELECT * INTO v_src_blocco FROM public.blocchi_preventivo WHERE id = (v_blocco->>'blocco_id')::uuid AND preventivo_id = v_prev.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Blocco % non appartiene al preventivo', v_blocco->>'blocco_id'; END IF;
    INSERT INTO public.blocchi_preventivo (preventivo_id, descrizione, rif_capitolato, note_tecniche, ordine, kit_id, um_base)
    VALUES (v_ordine_id, v_src_blocco.descrizione, v_src_blocco.rif_capitolato, v_src_blocco.note_tecniche, v_ord, v_src_blocco.kit_id, v_src_blocco.um_base) RETURNING id INTO v_new_blocco_id;
    v_ord := v_ord + 1;
    FOR v_riga IN SELECT * FROM jsonb_array_elements(COALESCE(v_blocco->'righe', '[]'::jsonb))
    LOOP
      SELECT * INTO v_src_riga FROM public.righe_preventivo WHERE id = (v_riga->>'riga_id')::uuid AND blocco_id = v_src_blocco.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Riga % non appartiene al blocco', v_riga->>'riga_id'; END IF;
      v_qta := COALESCE((v_riga->>'quantita')::numeric, 0);
      IF v_qta <= 0 THEN CONTINUE; END IF;
      v_residuo := COALESCE(v_src_riga.quantita, 0) - COALESCE(v_src_riga.qta_ordinata, 0);
      IF v_qta > v_residuo THEN RAISE EXCEPTION 'Quantità richiesta (%) superiore al residuo (%) per la riga %', v_qta, v_residuo, v_src_riga.id; END IF;
      v_ratio := CASE WHEN COALESCE(v_src_riga.quantita, 0) > 0 THEN v_qta / v_src_riga.quantita ELSE 0 END;
      -- FM75 F4a: linea showroom conserva la descrizione salvata (varianti); altre linee ripristinano la descrizione Gamma.
      -- Quantità/prezzo già UM1: nessuna conversione, si copia solo la scelta di presentazione.
      INSERT INTO public.righe_preventivo (
        blocco_id, tipo_riga, articolo_id, descrizione, um, incidenza, quantita, qta_ordinata,
        prezzo_unit, sconto_perc, segno, importo, costo, ricarico, margine, vendita, peso,
        ordine, riga_origine_id, articolo_codice, sconti_gamma, maggiorazione_perc, um_scelta, stampabile, bene_significativo, aliquota_iva,
        fornitore_id, marca, codice_articolo_fornitore, listino_fornitore, leva_prezzo, fonte_prezzo, codice_famiglia, codice_sottofamiglia, um2, fattore_conversione
      ) VALUES (
        v_new_blocco_id, v_src_riga.tipo_riga, v_src_riga.articolo_id, CASE WHEN v_src_riga.articolo_codice IS NOT NULL AND v_prev.linea IS DISTINCT FROM 'showroom' THEN (SELECT a.descrizione FROM public.articoli_gamma a WHERE a.codice = v_src_riga.articolo_codice) ELSE v_src_riga.descrizione END, v_src_riga.um,
        v_src_riga.incidenza, v_qta, 0,
        v_src_riga.prezzo_unit, v_src_riga.sconto_perc, v_src_riga.segno,
        ROUND(COALESCE(v_src_riga.importo, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.costo, 0) * v_ratio, 2),
        v_src_riga.ricarico, v_src_riga.margine, ROUND(COALESCE(v_src_riga.vendita, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.peso, 0) * v_ratio, 3),
        v_src_riga.ordine, v_src_riga.id, v_src_riga.articolo_codice, v_src_riga.sconti_gamma, v_src_riga.maggiorazione_perc, v_src_riga.um_scelta, v_src_riga.stampabile, v_src_riga.bene_significativo, v_src_riga.aliquota_iva,
        v_src_riga.fornitore_id, v_src_riga.marca, v_src_riga.codice_articolo_fornitore, v_src_riga.listino_fornitore, v_src_riga.leva_prezzo, v_src_riga.fonte_prezzo, v_src_riga.codice_famiglia, v_src_riga.codice_sottofamiglia, v_src_riga.um2, v_src_riga.fattore_conversione
      );
    END LOOP;
  END LOOP;
  UPDATE public.blocchi_preventivo b SET importo = COALESCE(s.tot, 0)
    FROM (SELECT r.blocco_id, SUM(COALESCE(r.importo, 0)) AS tot FROM public.righe_preventivo r GROUP BY r.blocco_id) s
   WHERE b.id = s.blocco_id AND b.preventivo_id = v_ordine_id;
  -- FM75 F3d: IVA e totale dal gemello SQL calcola_riepilogo_iva (fonte unica TS totaliDocumento).
  UPDATE public.preventivi p SET totale_imponibile = t.imp, iva_importo = t.imp + t.iva - t.imp, totale = t.imp + t.iva
    FROM (SELECT COALESCE(SUM(x.imponibile), 0) AS imp, COALESCE(SUM(x.iva), 0) AS iva FROM public.calcola_riepilogo_iva(v_ordine_id) x) t
   WHERE p.id = v_ordine_id;
  IF v_prev.stato IS DISTINCT FROM 'ordinato' THEN
    UPDATE public.preventivi SET stato_prima_ordine = stato, stato = 'ordinato' WHERE id = v_prev.id;
  END IF;
  RETURN v_ordine_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) TO authenticated, service_role;