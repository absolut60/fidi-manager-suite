-- FM61: regole prezzo a lotti (≤ 5000) + chiusura finale, stesso meccanismo delle giacenze.
CREATE OR REPLACE FUNCTION public.import_regole_prezzo_gamma_lotto(_tabella text, _righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pk text; v_ins integer := 0; v_dep integer := 0;
BEGIN
  v_pk := CASE _tabella
    WHEN 'listini_priorita_gamma' THEN 'priorita'
    WHEN 'clienti_condizioni_gamma' THEN 'cliente_codice'
    WHEN 'sconti_categoria_gamma' THEN 'id'
    WHEN 'sconti_cliente_famiglia_gamma' THEN 'id'
    WHEN 'listino_piu_articoli_gamma' THEN 'id'
    WHEN 'prezzi_cliente_articolo_gamma' THEN 'id'
    WHEN 'prezzi_deposito_gamma' THEN 'id'
  END;
  IF v_pk IS NULL THEN RAISE EXCEPTION 'Tabella non ammessa: %', _tabella; END IF;
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  IF _righe IS NULL OR jsonb_typeof(_righe) <> 'array' OR jsonb_array_length(_righe) = 0 THEN
    RETURN jsonb_build_object('inseriti', 0, 'deposito_inesistente', 0);
  END IF;
  -- Retry-safe: le chiavi del lotto vengono riscritte.
  EXECUTE format('DELETE FROM public.%1$I t WHERE t.%2$I IN (SELECT (jsonb_populate_record(NULL::public.%1$I, e)).%2$I FROM jsonb_array_elements($1) e)', _tabella, v_pk)
    USING _righe;
  IF _tabella = 'prezzi_deposito_gamma' THEN
    SELECT count(*) INTO v_dep FROM jsonb_populate_recordset(NULL::public.prezzi_deposito_gamma, _righe) r
    WHERE r.deposito_codice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = r.deposito_codice);
    INSERT INTO public.prezzi_deposito_gamma
    SELECT (r).* FROM (SELECT jsonb_populate_record(NULL::public.prezzi_deposito_gamma, e || jsonb_build_object('importazione_id', _importazione)) AS r
                       FROM jsonb_array_elements(_righe) e) x
    WHERE (r).deposito_codice IS NULL OR EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = (r).deposito_codice);
    GET DIAGNOSTICS v_ins = ROW_COUNT;
  ELSE
    EXECUTE format('INSERT INTO public.%1$I SELECT (r).* FROM (SELECT jsonb_populate_record(NULL::public.%1$I, e || jsonb_build_object(''importazione_id'', $2)) AS r FROM jsonb_array_elements($1) e) x', _tabella)
      USING _righe, _importazione;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('inseriti', v_ins, 'deposito_inesistente', v_dep);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_regole_prezzo_gamma_lotto(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_regole_prezzo_gamma_lotto(text, jsonb, uuid) TO service_role;

-- Chiusura: cancella le righe di import precedenti (chiamata solo se tutti i lotti sono riusciti e c'era almeno una riga).
CREATE OR REPLACE FUNCTION public.chiudi_regole_prezzo_gamma(_tabella text, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_righe integer := 0; v_rim integer := 0; v_cnf integer := 0; v_nc integer := 0;
BEGIN
  IF _tabella NOT IN ('listini_priorita_gamma','clienti_condizioni_gamma','sconti_categoria_gamma','sconti_cliente_famiglia_gamma',
                      'listino_piu_articoli_gamma','prezzi_cliente_articolo_gamma','prezzi_deposito_gamma') THEN
    RAISE EXCEPTION 'Tabella non ammessa: %', _tabella;
  END IF;
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE importazione_id = $1', _tabella) INTO v_righe USING _importazione;
  IF v_righe = 0 THEN RAISE EXCEPTION 'Nessuna riga di questo import: chiusura annullata'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE importazione_id IS DISTINCT FROM $1', _tabella) USING _importazione;
  GET DIAGNOSTICS v_rim = ROW_COUNT;
  IF _tabella IN ('clienti_condizioni_gamma','sconti_cliente_famiglia_gamma','prezzi_cliente_articolo_gamma') THEN
    EXECUTE format('UPDATE public.%I t SET cliente_id = c.id FROM public.clienti c WHERE c.codice_gestionale = t.cliente_codice::text AND t.cliente_id IS DISTINCT FROM c.id', _tabella);
    EXECUTE format('SELECT count(DISTINCT cliente_codice) FROM public.%I WHERE cliente_codice IS NOT NULL AND cliente_id IS NULL', _tabella) INTO v_cnf;
  END IF;
  IF _tabella IN ('listino_piu_articoli_gamma','prezzi_cliente_articolo_gamma','prezzi_deposito_gamma') THEN
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE t.articolo_codice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = t.articolo_codice)', _tabella) INTO v_nc;
  END IF;
  RETURN jsonb_build_object('righe', v_righe, 'rimossi', v_rim, 'clienti_non_trovati', v_cnf, 'non_in_catalogo', v_nc);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.chiudi_regole_prezzo_gamma(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chiudi_regole_prezzo_gamma(text, uuid) TO service_role;

COMMENT ON FUNCTION public.sostituisci_regole_prezzo_gamma(text, jsonb, uuid) IS 'DEPRECATED: sostituita da import_regole_prezzo_gamma_lotto + chiudi_regole_prezzo_gamma';