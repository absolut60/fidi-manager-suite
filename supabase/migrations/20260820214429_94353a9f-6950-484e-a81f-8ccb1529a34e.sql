CREATE OR REPLACE FUNCTION public.prossimo_numero_preventivo(p_anno integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_next integer;
BEGIN
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^PRV-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^PRV-[0-9]+/' || v_suffix || '$');
  INSERT INTO public.contatori_preventivo (anno, tipo, ultimo_numero)
  VALUES (p_anno, 'preventivo', GREATEST(v_base, v_max_doc + 1))
  ON CONFLICT (anno, tipo) DO UPDATE
    SET ultimo_numero = GREATEST(public.contatori_preventivo.ultimo_numero + 1, v_base, v_max_doc + 1)
  RETURNING ultimo_numero INTO v_next;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.anteprima_numero_preventivo(p_anno integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_cont integer;
BEGIN
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^PRV-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^PRV-[0-9]+/' || v_suffix || '$');
  SELECT COALESCE(ultimo_numero, 0) INTO v_cont
    FROM public.contatori_preventivo WHERE anno = p_anno AND tipo = 'preventivo';
  RETURN GREATEST(v_base, v_max_doc + 1, COALESCE(v_cont, 0) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.prossimo_numero_ordine(p_anno integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_next integer;
BEGIN
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^ORD-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^ORD-[0-9]+/' || v_suffix || '$');
  INSERT INTO public.contatori_preventivo (anno, tipo, ultimo_numero)
  VALUES (p_anno, 'ordine', GREATEST(v_base, v_max_doc + 1))
  ON CONFLICT (anno, tipo) DO UPDATE
    SET ultimo_numero = GREATEST(public.contatori_preventivo.ultimo_numero + 1, v_base, v_max_doc + 1)
  RETURNING ultimo_numero INTO v_next;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.anteprima_numero_ordine(p_anno integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base integer := CASE WHEN p_anno = 2026 THEN 100 ELSE 1 END;
  v_suffix text := lpad((p_anno % 100)::text, 2, '0');
  v_max_doc integer;
  v_cont integer;
BEGIN
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(numero, '^ORD-([0-9]+)/[0-9]+$', '\1'))::integer), 0)
    INTO v_max_doc FROM public.preventivi
   WHERE numero ~ ('^ORD-[0-9]+/' || v_suffix || '$');
  SELECT COALESCE(ultimo_numero, 0) INTO v_cont
    FROM public.contatori_preventivo WHERE anno = p_anno AND tipo = 'ordine';
  RETURN GREATEST(v_base, v_max_doc + 1, COALESCE(v_cont, 0) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.trasforma_preventivo_in_ordine(p_preventivo_id uuid, p_selezione jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_prev FROM public.preventivi WHERE id = p_preventivo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preventivo non trovato';
  END IF;
  IF v_prev.tipo <> 'preventivo' THEN
    RAISE EXCEPTION 'Il documento non è un preventivo';
  END IF;

  v_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_suffix := lpad((v_anno % 100)::text, 2, '0');

  LOOP
    v_tentativi := v_tentativi + 1;
    BEGIN
      v_num := public.prossimo_numero_ordine(v_anno);
      v_numero := 'ORD-' || v_num::text || '/' || v_suffix;
      INSERT INTO public.preventivi (
        tipo, numero, data, cliente_id, agente_codice, cantiere_id, filiale,
        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id
      ) VALUES (
        'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id
      ) RETURNING id INTO v_ordine_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tentativi >= 5 THEN
        RAISE EXCEPTION 'Impossibile generare un numero ordine univoco';
      END IF;
    END;
  END LOOP;

  v_ord := 0;
  FOR v_blocco IN SELECT * FROM jsonb_array_elements(COALESCE(p_selezione, '[]'::jsonb))
  LOOP
    SELECT * INTO v_src_blocco FROM public.blocchi_preventivo
     WHERE id = (v_blocco->>'blocco_id')::uuid AND preventivo_id = v_prev.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Blocco % non appartiene al preventivo', v_blocco->>'blocco_id';
    END IF;

    INSERT INTO public.blocchi_preventivo (
      preventivo_id, descrizione, rif_capitolato, note_tecniche, ordine, kit_id, um_base
    ) VALUES (
      v_ordine_id, v_src_blocco.descrizione, v_src_blocco.rif_capitolato, v_src_blocco.note_tecniche,
      v_ord, v_src_blocco.kit_id, v_src_blocco.um_base
    ) RETURNING id INTO v_new_blocco_id;
    v_ord := v_ord + 1;

    FOR v_riga IN SELECT * FROM jsonb_array_elements(COALESCE(v_blocco->'righe', '[]'::jsonb))
    LOOP
      SELECT * INTO v_src_riga FROM public.righe_preventivo
       WHERE id = (v_riga->>'riga_id')::uuid AND blocco_id = v_src_blocco.id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Riga % non appartiene al blocco', v_riga->>'riga_id';
      END IF;

      v_qta := COALESCE((v_riga->>'quantita')::numeric, 0);
      IF v_qta <= 0 THEN
        CONTINUE;
      END IF;
      v_residuo := COALESCE(v_src_riga.quantita, 0) - COALESCE(v_src_riga.qta_ordinata, 0);
      IF v_qta > v_residuo THEN
        RAISE EXCEPTION 'Quantità richiesta (%) superiore al residuo (%) per la riga %', v_qta, v_residuo, v_src_riga.id;
      END IF;

      v_ratio := CASE WHEN COALESCE(v_src_riga.quantita, 0) > 0 THEN v_qta / v_src_riga.quantita ELSE 0 END;

      INSERT INTO public.righe_preventivo (
        blocco_id, tipo_riga, articolo_id, descrizione, um, incidenza, quantita, qta_ordinata,
        prezzo_unit, sconto_perc, segno, importo, costo, ricarico, margine, vendita, peso,
        ordine, riga_origine_id
      ) VALUES (
        v_new_blocco_id, v_src_riga.tipo_riga, v_src_riga.articolo_id, v_src_riga.descrizione, v_src_riga.um,
        v_src_riga.incidenza, v_qta, 0,
        v_src_riga.prezzo_unit, v_src_riga.sconto_perc, v_src_riga.segno,
        ROUND(COALESCE(v_src_riga.importo, 0) * v_ratio, 2),
        ROUND(COALESCE(v_src_riga.costo, 0) * v_ratio, 2),
        v_src_riga.ricarico, v_src_riga.margine,
        ROUND(COALESCE(v_src_riga.vendita, 0) * v_ratio, 2),
        ROUND(COALESCE(v_src_riga.peso, 0) * v_ratio, 3),
        v_src_riga.ordine, v_src_riga.id
      );

      UPDATE public.righe_preventivo
         SET qta_ordinata = COALESCE(qta_ordinata, 0) + v_qta
       WHERE id = v_src_riga.id;
    END LOOP;
  END LOOP;

  UPDATE public.blocchi_preventivo b
     SET importo = COALESCE(s.tot, 0)
    FROM (
      SELECT r.blocco_id, SUM(COALESCE(r.importo, 0) * COALESCE(r.segno, 1)) AS tot
        FROM public.righe_preventivo r
       GROUP BY r.blocco_id
    ) s
   WHERE b.id = s.blocco_id AND b.preventivo_id = v_ordine_id;

  UPDATE public.preventivi p
     SET totale_imponibile = t.imp,
         iva_importo = ROUND(t.imp * COALESCE(p.iva_perc, 0) / 100.0, 2),
         totale = ROUND(t.imp * (1 + COALESCE(p.iva_perc, 0) / 100.0), 2)
    FROM (
      SELECT COALESCE(SUM(COALESCE(b.importo, 0)), 0) AS imp
        FROM public.blocchi_preventivo b
       WHERE b.preventivo_id = v_ordine_id
    ) t
   WHERE p.id = v_ordine_id;

  RETURN v_ordine_id;
END;
$$;