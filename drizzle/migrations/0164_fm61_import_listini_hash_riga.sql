-- Impronta delle righe importate (md5 calcolato nel browser): le RPC riscrivono solo righe nuove o cambiate.
ALTER TABLE public.fornitori ADD COLUMN IF NOT EXISTS hash_riga text;
ALTER TABLE public.articoli_gamma ADD COLUMN IF NOT EXISTS hash_riga text;
ALTER TABLE public.giacenze_gamma ADD COLUMN IF NOT EXISTS hash_riga text;
ALTER TABLE public.articoli_gamma_fornitori ADD COLUMN IF NOT EXISTS hash_riga text;
COMMENT ON COLUMN public.fornitori.hash_riga IS 'Solo origine gamma: md5 dei campi importati (import listini Gamma)';

CREATE OR REPLACE FUNCTION public.import_fornitori_gamma_lotto(_righe jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_inv integer := 0;
BEGIN
  CREATE TEMP TABLE _fg ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_righe) AS r(
      codice_gestionale integer, ragione_sociale text, alias text, valida boolean,
      indirizzo text, cap text, citta text, provincia text, stato text,
      partita_iva text, codice_fiscale text, persona_fisica boolean,
      telefono text, telefono_2 text, cellulare text, fax text, email text, sito text, pec text,
      condizione_pagamento_cod text, condizione_pagamento_desc text,
      ultima_modifica_gamma timestamptz, codice_anagrafica_generale integer, codice_cliente_gamma integer, hash_riga text)
  WHERE codice_gestionale IS NOT NULL;

  WITH inv AS (
    UPDATE public.fornitori f SET attivo = true, ultima_sincronizzazione = now()
    FROM _fg s
    WHERE f.codice_gestionale = s.codice_gestionale AND f.origine = 'gamma'
      AND s.hash_riga IS NOT NULL AND f.hash_riga = s.hash_riga
    RETURNING f.codice_gestionale
  ), del AS (
    DELETE FROM _fg s USING inv i WHERE s.codice_gestionale = i.codice_gestionale RETURNING 1
  )
  SELECT count(*) INTO v_inv FROM del;

  WITH up AS (
    INSERT INTO public.fornitori AS f (
      nome, ragione_sociale, origine, categoria_fornitore, attivo, ultima_sincronizzazione,
      codice_gestionale, alias, valida, indirizzo, cap, citta, provincia, stato,
      partita_iva, codice_fiscale, persona_fisica, telefono, telefono_2, cellulare, fax,
      email, sito, pec, condizione_pagamento_cod, condizione_pagamento_desc,
      ultima_modifica_gamma, codice_anagrafica_generale, codice_cliente_gamma, hash_riga)
    SELECT COALESCE(s.ragione_sociale, 'Fornitore ' || s.codice_gestionale), s.ragione_sociale, 'gamma', 'materiali', true, now(),
      s.codice_gestionale, s.alias, s.valida, s.indirizzo, s.cap, s.citta, s.provincia, s.stato,
      s.partita_iva, s.codice_fiscale, s.persona_fisica, s.telefono, s.telefono_2, s.cellulare, s.fax,
      s.email, s.sito, s.pec, s.condizione_pagamento_cod, s.condizione_pagamento_desc,
      s.ultima_modifica_gamma, s.codice_anagrafica_generale, s.codice_cliente_gamma, s.hash_riga
    FROM _fg s
    ON CONFLICT (codice_gestionale) DO UPDATE SET
      nome = EXCLUDED.nome, ragione_sociale = EXCLUDED.ragione_sociale,
      categoria_fornitore = 'materiali', attivo = true, ultima_sincronizzazione = now(),
      alias = EXCLUDED.alias, valida = EXCLUDED.valida, indirizzo = EXCLUDED.indirizzo, cap = EXCLUDED.cap,
      citta = EXCLUDED.citta, provincia = EXCLUDED.provincia, stato = EXCLUDED.stato,
      partita_iva = EXCLUDED.partita_iva, codice_fiscale = EXCLUDED.codice_fiscale,
      persona_fisica = EXCLUDED.persona_fisica, telefono = EXCLUDED.telefono, telefono_2 = EXCLUDED.telefono_2,
      cellulare = EXCLUDED.cellulare, fax = EXCLUDED.fax, email = EXCLUDED.email, sito = EXCLUDED.sito,
      pec = EXCLUDED.pec, condizione_pagamento_cod = EXCLUDED.condizione_pagamento_cod,
      condizione_pagamento_desc = EXCLUDED.condizione_pagamento_desc,
      ultima_modifica_gamma = EXCLUDED.ultima_modifica_gamma,
      codice_anagrafica_generale = EXCLUDED.codice_anagrafica_generale,
      codice_cliente_gamma = EXCLUDED.codice_cliente_gamma, hash_riga = EXCLUDED.hash_riga
    WHERE f.origine = 'gamma'
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;
  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'invariati', v_inv);
END;
$$;

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

  INSERT INTO public.marche (codice, ultima_sincronizzazione)
  SELECT DISTINCT marca_codice, now() FROM _ag WHERE marca_codice IS NOT NULL
  ON CONFLICT (codice) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.import_giacenze_gamma_lotto(_righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_inv integer := 0; v_nc integer := 0; v_scart jsonb;
BEGIN
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  CREATE TEMP TABLE _gg ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(articolo_codice), btrim(deposito_codice))
    btrim(articolo_codice) AS articolo_codice, btrim(deposito_codice) AS deposito_codice,
    giacenza, impegnato_clienti, ordinato_fornitori, disponibilita, aggiornato_gamma, hash_riga
  FROM jsonb_to_recordset(_righe) AS r(articolo_codice text, deposito_codice text, giacenza numeric,
    impegnato_clienti numeric, ordinato_fornitori numeric, disponibilita numeric, aggiornato_gamma timestamp, hash_riga text)
  WHERE articolo_codice IS NOT NULL AND btrim(articolo_codice) <> '' AND deposito_codice IS NOT NULL AND btrim(deposito_codice) <> ''
  ORDER BY btrim(articolo_codice), btrim(deposito_codice);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('articolo_codice', g.articolo_codice, 'deposito_codice', g.deposito_codice)), '[]'::jsonb)
  INTO v_scart FROM _gg g WHERE NOT EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = g.deposito_codice);

  SELECT count(*) INTO v_nc FROM _gg g
  WHERE EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = g.deposito_codice)
    AND NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = g.articolo_codice);

  -- Invariate: solo importazione_id (serve alla chiusura).
  WITH inv AS (
    UPDATE public.giacenze_gamma t SET importazione_id = _importazione
    FROM _gg g
    WHERE t.articolo_codice = g.articolo_codice AND t.deposito_codice = g.deposito_codice
      AND g.hash_riga IS NOT NULL AND t.hash_riga = g.hash_riga
    RETURNING t.articolo_codice, t.deposito_codice
  ), del AS (
    DELETE FROM _gg g USING inv i WHERE g.articolo_codice = i.articolo_codice AND g.deposito_codice = i.deposito_codice
    RETURNING 1
  )
  SELECT count(*) INTO v_inv FROM del;

  WITH up AS (
    INSERT INTO public.giacenze_gamma AS t (articolo_codice, deposito_codice, giacenza, impegnato_clienti, ordinato_fornitori, disponibilita, aggiornato_gamma, importazione_id, hash_riga)
    SELECT g.articolo_codice, g.deposito_codice, g.giacenza, g.impegnato_clienti, g.ordinato_fornitori, g.disponibilita,
      g.aggiornato_gamma AT TIME ZONE 'Europe/Rome', _importazione, g.hash_riga
    FROM _gg g JOIN public.depositi d ON d.codice = g.deposito_codice
    ON CONFLICT (articolo_codice, deposito_codice) DO UPDATE SET giacenza = EXCLUDED.giacenza,
      impegnato_clienti = EXCLUDED.impegnato_clienti, ordinato_fornitori = EXCLUDED.ordinato_fornitori,
      disponibilita = EXCLUDED.disponibilita, aggiornato_gamma = EXCLUDED.aggiornato_gamma,
      importazione_id = EXCLUDED.importazione_id, hash_riga = EXCLUDED.hash_riga
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'invariati', v_inv, 'non_in_catalogo', v_nc, 'deposito_inesistente', v_scart);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_articoli_fornitori_gamma_lotto(_righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_inv integer := 0; v_nc integer := 0; v_nf integer := 0; v_nf2 integer := 0;
BEGIN
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  CREATE TEMP TABLE _af ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(articolo_codice), fornitore_codice, COALESCE(btrim(codice_articolo_fornitore), ''))
    btrim(articolo_codice) AS articolo_codice, fornitore_codice, COALESCE(preferenziale, false) AS preferenziale,
    COALESCE(btrim(codice_articolo_fornitore), '') AS codice_articolo_fornitore, hash_riga
  FROM jsonb_to_recordset(_righe) AS r(articolo_codice text, fornitore_codice integer, preferenziale boolean, codice_articolo_fornitore text, hash_riga text)
  WHERE articolo_codice IS NOT NULL AND btrim(articolo_codice) <> '' AND fornitore_codice IS NOT NULL
  ORDER BY btrim(articolo_codice), fornitore_codice, COALESCE(btrim(codice_articolo_fornitore), ''), COALESCE(preferenziale, false) DESC;

  SELECT count(*) INTO v_nc FROM _af s WHERE NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = s.articolo_codice);

  -- Invariate (stessa impronta, fornitore già risolto se esiste): solo importazione_id.
  WITH inv AS (
    UPDATE public.articoli_gamma_fornitori t SET importazione_id = _importazione
    FROM _af s
    WHERE t.articolo_codice = s.articolo_codice AND t.fornitore_codice = s.fornitore_codice
      AND t.codice_articolo_fornitore = s.codice_articolo_fornitore
      AND s.hash_riga IS NOT NULL AND t.hash_riga = s.hash_riga
      AND (t.fornitore_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.fornitori f WHERE f.codice_gestionale = s.fornitore_codice))
    RETURNING t.articolo_codice, t.fornitore_codice, t.codice_articolo_fornitore, t.fornitore_id
  ), del AS (
    DELETE FROM _af s USING inv i WHERE s.articolo_codice = i.articolo_codice AND s.fornitore_codice = i.fornitore_codice
      AND s.codice_articolo_fornitore = i.codice_articolo_fornitore
    RETURNING (i.fornitore_id IS NULL) AS sconosciuto
  )
  SELECT count(*), count(*) FILTER (WHERE sconosciuto) INTO v_inv, v_nf FROM del;

  WITH up AS (
    INSERT INTO public.articoli_gamma_fornitori AS t (articolo_codice, fornitore_codice, fornitore_id, preferenziale, codice_articolo_fornitore, importazione_id, hash_riga)
    SELECT s.articolo_codice, s.fornitore_codice, f.id, s.preferenziale, s.codice_articolo_fornitore, _importazione, s.hash_riga
    FROM _af s LEFT JOIN public.fornitori f ON f.codice_gestionale = s.fornitore_codice
    ON CONFLICT (articolo_codice, fornitore_codice, codice_articolo_fornitore) DO UPDATE SET fornitore_id = EXCLUDED.fornitore_id,
      preferenziale = EXCLUDED.preferenziale, importazione_id = EXCLUDED.importazione_id, hash_riga = EXCLUDED.hash_riga
    RETURNING (xmax = 0) AS inserito, fornitore_id
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito), count(*) FILTER (WHERE fornitore_id IS NULL)
  INTO v_ins, v_upd, v_nf2 FROM up;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'invariati', v_inv, 'non_in_catalogo', v_nc, 'fornitore_sconosciuto', v_nf + v_nf2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_fornitori_gamma_lotto(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_giacenze_gamma_lotto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_giacenze_gamma_lotto(jsonb, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) TO service_role;
