-- FM65 R1a: struttura additiva; valori salvati sempre UM1, nessun backfill.
ALTER TABLE public.preventivi ADD COLUMN titolo text NULL;
ALTER TABLE public.preventivi ADD COLUMN alternativa_di uuid NULL REFERENCES public.preventivi(id) ON DELETE SET NULL;
CREATE INDEX preventivi_alternativa_di_idx ON public.preventivi(alternativa_di);
ALTER TABLE public.preventivi ADD COLUMN creato_da uuid NULL;
ALTER TABLE public.preventivi ALTER COLUMN creato_da SET DEFAULT auth.uid();
ALTER TABLE public.preventivi ADD COLUMN condizione_pagamento_cod text NULL;
ALTER TABLE public.righe_preventivo ADD COLUMN um_scelta text NOT NULL DEFAULT 'um1' CHECK (um_scelta IN ('um1','um2'));
COMMENT ON COLUMN public.righe_preventivo.um_scelta IS 'Solo unità di visualizzazione/inserimento/stampa. Quantità e prezzi salvati SEMPRE in UM1; ordine copia senza conversioni.';
COMMENT ON COLUMN public.preventivi.condizione_pagamento_cod IS 'Codice catalogo public.codici_pagamento.cod, senza FK.';
CREATE FUNCTION public.preventivi_valida_alternativa_autore()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE principale public.preventivi%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.creato_da := OLD.creato_da; END IF;
  IF NEW.alternativa_di IS NOT NULL THEN
    IF NEW.alternativa_di = NEW.id THEN
      RAISE EXCEPTION 'Un preventivo non può essere alternativa di sé stesso' USING ERRCODE='23514';
    END IF;
    SELECT * INTO principale FROM public.preventivi WHERE id=NEW.alternativa_di FOR SHARE;
    IF NOT FOUND OR principale.tipo <> 'preventivo' OR NEW.tipo <> 'preventivo' THEN
      RAISE EXCEPTION 'L’alternativa deve riferirsi a un preventivo principale' USING ERRCODE='23514';
    END IF;
    IF principale.alternativa_di IS NOT NULL THEN
      RAISE EXCEPTION 'Non è possibile creare l’alternativa di un’alternativa' USING ERRCODE='23514';
    END IF;
    IF NEW.cliente_id IS NULL OR principale.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
      RAISE EXCEPTION 'L’alternativa deve appartenere allo stesso cliente del preventivo principale' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.preventivi p WHERE p.alternativa_di=OLD.id
      AND (NEW.tipo <> 'preventivo' OR NEW.alternativa_di IS NOT NULL OR p.cliente_id IS DISTINCT FROM NEW.cliente_id)
  ) THEN
    RAISE EXCEPTION 'La modifica renderebbe non valide le alternative del preventivo' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.preventivi_valida_alternativa_autore() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preventivi_valida_alternativa_autore() TO service_role;
CREATE TRIGGER preventivi_alternativa_autore BEFORE INSERT OR UPDATE ON public.preventivi FOR EACH ROW EXECUTE FUNCTION public.preventivi_valida_alternativa_autore();
CREATE FUNCTION public.lettera_preventivo(_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.preventivi%ROWTYPE; n integer; risultato text := '';
BEGIN
  IF NOT public.auth_vede_preventivo_id(_id) THEN
    RAISE EXCEPTION 'Non autorizzato a consultare il preventivo' USING ERRCODE='42501';
  END IF;
  SELECT * INTO p FROM public.preventivi WHERE id=_id AND tipo='preventivo';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.alternativa_di IS NULL THEN RETURN 'A'; END IF;
  SELECT count(*)::integer + 1 INTO n FROM public.preventivi s
   WHERE s.alternativa_di=p.alternativa_di AND (s.created_at,s.id) <= (p.created_at,p.id);
  WHILE n > 0 LOOP
    n := n-1; risultato := chr(65 + n%26) || risultato; n := n/26;
  END LOOP;
  RETURN risultato;
END;
$$;
COMMENT ON FUNCTION public.lettera_preventivo(uuid) IS 'Lettera non salvata: principale A; alternative B,C... per created_at,id. Gemella TS letteraPreventivo in preventivo-creazione.ts.';
REVOKE EXECUTE ON FUNCTION public.lettera_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lettera_preventivo(uuid) TO authenticated, service_role;
CREATE FUNCTION public.cerca_clienti_preventivo(_q text)
RETURNS TABLE(id uuid, codice_gestionale text, ragione_sociale text, partita_iva text, indirizzo text, cap text, citta text, provincia text, fascia_listino_default text, codice_agente text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE q text := btrim(coalesce(_q,'')); pattern text;
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato a cercare clienti per il preventivo' USING ERRCODE='42501';
  END IF;
  -- Query statica parametrizzata: escape LIKE letterale, nessuna sintassi PostgREST.
  pattern := replace(replace(replace(q, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');
  RETURN QUERY SELECT c.id,c.codice_gestionale,c.ragione_sociale,c.partita_iva,c.indirizzo,c.cap,c.citta,c.provincia,c.fascia_listino_default::text,c.codice_agente
  FROM public.clienti c
  WHERE ((SELECT public.auth_ha_accesso_preventivi()) OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente))
    AND (q='' OR c.codice_gestionale ILIKE pattern||'%' ESCAPE E'\\' OR c.ragione_sociale ILIKE '%'||pattern||'%' ESCAPE E'\\' OR c.partita_iva ILIKE '%'||pattern||'%' ESCAPE E'\\')
  ORDER BY (c.codice_gestionale=q) DESC NULLS LAST,c.ragione_sociale,c.id LIMIT 50;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cerca_clienti_preventivo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerca_clienti_preventivo(text) TO authenticated, service_role;
CREATE FUNCTION public.dati_cliente_preventivo(_id uuid)
RETURNS TABLE(id uuid,codice_gestionale text,ragione_sociale text,partita_iva text,indirizzo text,cap text,citta text,provincia text,telefono text,cellulare text,email text,pec text,condizione_pagamento_cod text,condizione_pagamento_desc text,codice_agente text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.auth_consulta_preventivi() THEN
    RAISE EXCEPTION 'Non autorizzato a consultare il cliente per il preventivo' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT c.id,c.codice_gestionale,c.ragione_sociale,c.partita_iva,c.indirizzo,c.cap,c.citta,c.provincia,c.telefono,c.cellulare,c.email,c.pec,c.condizione_pagamento_cod,coalesce(cp.descrizione,c.condizione_pagamento_desc),c.codice_agente
  FROM public.clienti c LEFT JOIN public.codici_pagamento cp ON cp.cod=c.condizione_pagamento_cod
  WHERE c.id=_id AND ((SELECT public.auth_ha_accesso_preventivi()) OR public.user_can_access_cliente(c.id,c.store_id,c.codice_agente)
    OR EXISTS (SELECT 1 FROM public.preventivi p WHERE p.cliente_id=c.id AND public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dati_cliente_preventivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dati_cliente_preventivo(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.trasforma_preventivo_in_ordine(p_preventivo_id uuid, p_selezione jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF NOT has_role(auth.uid(), 'amministratore'::app_role) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT * INTO v_prev FROM public.preventivi WHERE id = p_preventivo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preventivo non trovato'; END IF;
  IF v_prev.tipo <> 'preventivo' THEN RAISE EXCEPTION 'Il documento non è un preventivo'; END IF;
  v_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_suffix := lpad((v_anno % 100)::text, 2, '0');
  LOOP
    v_tentativi := v_tentativi + 1;
    BEGIN
      v_num := public.prossimo_numero_ordine(v_anno);
      v_numero := 'ORD-' || v_num::text || '/' || v_suffix;
      INSERT INTO public.preventivi (
        tipo, numero, data, cliente_id, agente_codice, cantiere_id, filiale,
        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di
      ) VALUES (
        'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL
      ) RETURNING id INTO v_ordine_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tentativi >= 5 THEN RAISE EXCEPTION 'Impossibile generare un numero ordine univoco'; END IF;
    END;
  END LOOP;
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
      -- Quantità/prezzo già UM1: nessuna conversione, si copia solo la scelta di presentazione.
      INSERT INTO public.righe_preventivo (
        blocco_id, tipo_riga, articolo_id, descrizione, um, incidenza, quantita, qta_ordinata,
        prezzo_unit, sconto_perc, segno, importo, costo, ricarico, margine, vendita, peso,
        ordine, riga_origine_id, articolo_codice, sconti_gamma, maggiorazione_perc, um_scelta
      ) VALUES (
        v_new_blocco_id, v_src_riga.tipo_riga, v_src_riga.articolo_id, v_src_riga.descrizione, v_src_riga.um,
        v_src_riga.incidenza, v_qta, 0,
        v_src_riga.prezzo_unit, v_src_riga.sconto_perc, v_src_riga.segno,
        ROUND(COALESCE(v_src_riga.importo, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.costo, 0) * v_ratio, 2),
        v_src_riga.ricarico, v_src_riga.margine, ROUND(COALESCE(v_src_riga.vendita, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.peso, 0) * v_ratio, 3),
        v_src_riga.ordine, v_src_riga.id, v_src_riga.articolo_codice, v_src_riga.sconti_gamma, v_src_riga.maggiorazione_perc, v_src_riga.um_scelta
      );
      UPDATE public.righe_preventivo SET qta_ordinata = COALESCE(qta_ordinata, 0) + v_qta WHERE id = v_src_riga.id;
    END LOOP;
  END LOOP;
  UPDATE public.blocchi_preventivo b SET importo = COALESCE(s.tot, 0)
    FROM (SELECT r.blocco_id, SUM(COALESCE(r.importo, 0)) AS tot FROM public.righe_preventivo r GROUP BY r.blocco_id) s
   WHERE b.id = s.blocco_id AND b.preventivo_id = v_ordine_id;
  UPDATE public.preventivi p SET totale_imponibile = t.imp, iva_importo = ROUND(t.imp * COALESCE(p.iva_perc, 0) / 100.0, 2), totale = ROUND(t.imp * (1 + COALESCE(p.iva_perc, 0) / 100.0), 2)
    FROM (SELECT COALESCE(SUM(COALESCE(b.importo, 0)), 0) AS imp FROM public.blocchi_preventivo b WHERE b.preventivo_id = v_ordine_id) t WHERE p.id = v_ordine_id;
  RETURN v_ordine_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) TO authenticated, service_role;