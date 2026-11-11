CREATE OR REPLACE FUNCTION public.import_articoli_gamma_lotto(_righe jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ins integer := 0; v_upd integer := 0; v_inv integer := 0; v_lis integer := 0; v_lis_inv integer := 0;
BEGIN
  CREATE TEMP TABLE _ag ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_righe) AS r(
    codice text, descrizione text, descrizione_estesa text, codice_famiglia text, famiglia text,
    codice_sottofamiglia text, sottofamiglia text, marca_codice text, um text, um2 text,
    fattore_conversione numeric, iva text, peso_netto numeric, stato_gamma text,
    data_creazione_gamma date, data_aggiornamento_gamma date, premio_fornitore text,
    codice_a_barre text, fornitore_pref_codice integer, codice_articolo_fornitore text,
    n_fornitori integer, costo_ultimo numeric, costo_medio numeric, costo_fifo numeric, listini jsonb, hash_riga text)
  WHERE codice IS NOT NULL AND codice <> '';

  -- Invariato = stessa impronta e fornitore preferenziale già risolto (se previsto): solo sincronizzazione/riattivazione.
  CREATE TEMP TABLE _ag_inv ON COMMIT DROP AS
  SELECT s.codice, s.listini FROM _ag s JOIN public.articoli_gamma a ON a.codice = s.codice
  WHERE s.hash_riga IS NOT NULL AND a.hash_riga = s.hash_riga
    AND (a.fornitore_pref_codice IS NULL OR a.fornitore_pref_id IS NOT NULL);

  UPDATE public.articoli_gamma a SET attivo = true, ultima_sincronizzazione = now()
  FROM _ag_inv i WHERE a.codice = i.codice;
  GET DIAGNOSTICS v_inv = ROW_COUNT;

  -- Righe listino degli invariati: già presenti, non riscritte (contate per il riepilogo).
  SELECT count(*) INTO v_lis_inv
  FROM _ag_inv i
  CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(i.listini, '[]'::jsonb)) AS x(listino smallint, prezzo_vendita numeric, costo_acquisto numeric)
  WHERE x.prezzo_vendita IS NOT NULL OR x.costo_acquisto IS NOT NULL;

  DELETE FROM _ag s USING _ag_inv i WHERE s.codice = i.codice;

  -- Le marche sono già importate una sola volta nello step articoli-marche.
  WITH up AS (
    INSERT INTO public.articoli_gamma AS a (
      codice, descrizione, descrizione_estesa, codice_famiglia, famiglia, codice_sottofamiglia, sottofamiglia,
      marca_codice, um, um2, fattore_conversione, iva, peso_netto, stato_gamma, data_creazione_gamma,
      data_aggiornamento_gamma, premio_fornitore, codice_a_barre, fornitore_pref_codice, fornitore_pref_id,
      codice_articolo_fornitore, n_fornitori, costo_ultimo, costo_medio, costo_fifo, attivo, ultima_sincronizzazione, hash_riga)
    SELECT s.codice, s.descrizione, s.descrizione_estesa, s.codice_famiglia, s.famiglia, s.codice_sottofamiglia, s.sottofamiglia,
      s.marca_codice, s.um, s.um2, s.fattore_conversione, s.iva, s.peso_netto, s.stato_gamma, s.data_creazione_gamma,
      s.data_aggiornamento_gamma, s.premio_fornitore, s.codice_a_barre, s.fornitore_pref_codice, f.id,
      s.codice_articolo_fornitore, s.n_fornitori, s.costo_ultimo, s.costo_medio, s.costo_fifo, true, now(), s.hash_riga
    FROM _ag s
    LEFT JOIN public.fornitori f ON f.codice_gestionale = s.fornitore_pref_codice AND s.fornitore_pref_codice IS NOT NULL
    ON CONFLICT (codice) DO UPDATE SET
      descrizione = EXCLUDED.descrizione, descrizione_estesa = EXCLUDED.descrizione_estesa,
      codice_famiglia = EXCLUDED.codice_famiglia, famiglia = EXCLUDED.famiglia,
      codice_sottofamiglia = EXCLUDED.codice_sottofamiglia, sottofamiglia = EXCLUDED.sottofamiglia,
      marca_codice = EXCLUDED.marca_codice, um = EXCLUDED.um, um2 = EXCLUDED.um2,
      fattore_conversione = EXCLUDED.fattore_conversione, iva = EXCLUDED.iva, peso_netto = EXCLUDED.peso_netto,
      stato_gamma = EXCLUDED.stato_gamma, data_creazione_gamma = EXCLUDED.data_creazione_gamma,
      data_aggiornamento_gamma = EXCLUDED.data_aggiornamento_gamma, premio_fornitore = EXCLUDED.premio_fornitore,
      codice_a_barre = EXCLUDED.codice_a_barre, fornitore_pref_codice = EXCLUDED.fornitore_pref_codice,
      fornitore_pref_id = EXCLUDED.fornitore_pref_id, codice_articolo_fornitore = EXCLUDED.codice_articolo_fornitore,
      n_fornitori = EXCLUDED.n_fornitori, costo_ultimo = EXCLUDED.costo_ultimo, costo_medio = EXCLUDED.costo_medio,
      costo_fifo = EXCLUDED.costo_fifo, attivo = true, ultima_sincronizzazione = now(), hash_riga = EXCLUDED.hash_riga
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;

  -- Listini riscritti solo per articoli nuovi o cambiati.
  DELETE FROM public.articoli_gamma_listini l USING _ag s WHERE l.articolo_codice = s.codice;
  INSERT INTO public.articoli_gamma_listini (articolo_codice, listino, prezzo_vendita, costo_acquisto)
  SELECT s.codice, x.listino, x.prezzo_vendita, x.costo_acquisto
  FROM _ag s
  CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(s.listini, '[]'::jsonb)) AS x(listino smallint, prezzo_vendita numeric, costo_acquisto numeric)
  WHERE x.prezzo_vendita IS NOT NULL OR x.costo_acquisto IS NOT NULL
  ON CONFLICT (articolo_codice, listino) DO NOTHING;
  GET DIAGNOSTICS v_lis = ROW_COUNT;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'invariati', v_inv,
    'listini', v_lis + v_lis_inv, 'listini_riscritti', v_lis);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) TO service_role;