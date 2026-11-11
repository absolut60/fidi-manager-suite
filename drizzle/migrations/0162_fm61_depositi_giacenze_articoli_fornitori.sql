CREATE TABLE public.depositi (
  codice text PRIMARY KEY CHECK (codice = btrim(codice) AND codice <> ''),
  descrizione text,
  codice_sede integer,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  sede_gamma integer,
  tipo text,
  conta_disponibilita text NOT NULL DEFAULT 'no' CHECK (conta_disponibilita IN ('si','no','logistica_comune')),
  attivo boolean NOT NULL DEFAULT true,
  ultima_sincronizzazione timestamptz
);
CREATE INDEX depositi_store_idx ON public.depositi (store_id);

CREATE TABLE public.giacenze_gamma (
  articolo_codice text NOT NULL,
  deposito_codice text NOT NULL REFERENCES public.depositi(codice) ON DELETE CASCADE,
  giacenza numeric,
  impegnato_clienti numeric,
  ordinato_fornitori numeric,
  disponibilita numeric,
  aggiornato_gamma timestamptz,
  importazione_id uuid,
  PRIMARY KEY (articolo_codice, deposito_codice)
);
CREATE INDEX giacenze_gamma_deposito_idx ON public.giacenze_gamma (deposito_codice);
CREATE INDEX giacenze_gamma_importazione_idx ON public.giacenze_gamma (importazione_id);

CREATE TABLE public.articoli_gamma_fornitori (
  articolo_codice text NOT NULL,
  fornitore_codice integer NOT NULL,
  fornitore_id uuid REFERENCES public.fornitori(id) ON DELETE SET NULL,
  preferenziale boolean NOT NULL DEFAULT false,
  codice_articolo_fornitore text,
  importazione_id uuid,
  PRIMARY KEY (articolo_codice, fornitore_codice)
);
CREATE INDEX articoli_gamma_fornitori_fornitore_idx ON public.articoli_gamma_fornitori (fornitore_id);
CREATE INDEX articoli_gamma_fornitori_codice_forn_idx ON public.articoli_gamma_fornitori (fornitore_codice);
CREATE INDEX articoli_gamma_fornitori_importazione_idx ON public.articoli_gamma_fornitori (importazione_id);

GRANT SELECT ON public.depositi, public.giacenze_gamma, public.articoli_gamma_fornitori TO authenticated;
GRANT ALL ON public.depositi, public.giacenze_gamma, public.articoli_gamma_fornitori TO service_role;

ALTER TABLE public.depositi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giacenze_gamma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articoli_gamma_fornitori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Secondo fattore (FM44)" ON public.depositi AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY depositi_select ON public.depositi FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));
CREATE POLICY "Secondo fattore (FM44)" ON public.giacenze_gamma AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY giacenze_gamma_select ON public.giacenze_gamma FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));
CREATE POLICY "Secondo fattore (FM44)" ON public.articoli_gamma_fornitori AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY articoli_gamma_fornitori_select ON public.articoli_gamma_fornitori FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));

CREATE OR REPLACE FUNCTION public.import_depositi_gamma(_righe jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_senza integer := 0;
BEGIN
  WITH src AS (
    SELECT DISTINCT ON (btrim(codice)) btrim(codice) AS codice, descrizione, codice_sede, sede_gamma, tipo, conta_disponibilita
    FROM jsonb_to_recordset(_righe) AS r(codice text, descrizione text, codice_sede integer, sede_gamma integer, tipo text, conta_disponibilita text)
    WHERE codice IS NOT NULL AND btrim(codice) <> '' AND conta_disponibilita IN ('si','no','logistica_comune')
    ORDER BY btrim(codice)
  ), up AS (
    INSERT INTO public.depositi AS d (codice, descrizione, codice_sede, store_id, sede_gamma, tipo, conta_disponibilita, attivo, ultima_sincronizzazione)
    SELECT s.codice, s.descrizione, s.codice_sede, st.id, s.sede_gamma, s.tipo, s.conta_disponibilita, true, now()
    FROM src s LEFT JOIN public.stores st ON s.codice_sede IS NOT NULL AND st.codice = s.codice_sede::text
    ON CONFLICT (codice) DO UPDATE SET descrizione = EXCLUDED.descrizione, codice_sede = EXCLUDED.codice_sede,
      store_id = EXCLUDED.store_id, sede_gamma = EXCLUDED.sede_gamma, tipo = EXCLUDED.tipo,
      conta_disponibilita = EXCLUDED.conta_disponibilita, attivo = true, ultima_sincronizzazione = now()
    RETURNING (xmax = 0) AS inserito, codice_sede, store_id
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito),
         count(*) FILTER (WHERE codice_sede IS NOT NULL AND store_id IS NULL)
  INTO v_ins, v_upd, v_senza FROM up;
  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'sede_senza_negozio', v_senza);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_giacenze_gamma_lotto(_righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_nc integer := 0; v_scart jsonb;
BEGIN
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  CREATE TEMP TABLE _gg ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(articolo_codice), btrim(deposito_codice))
    btrim(articolo_codice) AS articolo_codice, btrim(deposito_codice) AS deposito_codice,
    giacenza, impegnato_clienti, ordinato_fornitori, disponibilita, aggiornato_gamma
  FROM jsonb_to_recordset(_righe) AS r(articolo_codice text, deposito_codice text, giacenza numeric,
    impegnato_clienti numeric, ordinato_fornitori numeric, disponibilita numeric, aggiornato_gamma timestamp)
  WHERE articolo_codice IS NOT NULL AND btrim(articolo_codice) <> '' AND deposito_codice IS NOT NULL AND btrim(deposito_codice) <> ''
  ORDER BY btrim(articolo_codice), btrim(deposito_codice);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('articolo_codice', g.articolo_codice, 'deposito_codice', g.deposito_codice)), '[]'::jsonb)
  INTO v_scart FROM _gg g WHERE NOT EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = g.deposito_codice);

  SELECT count(*) INTO v_nc FROM _gg g
  WHERE EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = g.deposito_codice)
    AND NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = g.articolo_codice);

  WITH up AS (
    INSERT INTO public.giacenze_gamma AS t (articolo_codice, deposito_codice, giacenza, impegnato_clienti, ordinato_fornitori, disponibilita, aggiornato_gamma, importazione_id)
    SELECT g.articolo_codice, g.deposito_codice, g.giacenza, g.impegnato_clienti, g.ordinato_fornitori, g.disponibilita,
      g.aggiornato_gamma AT TIME ZONE 'Europe/Rome', _importazione
    FROM _gg g JOIN public.depositi d ON d.codice = g.deposito_codice
    ON CONFLICT (articolo_codice, deposito_codice) DO UPDATE SET giacenza = EXCLUDED.giacenza,
      impegnato_clienti = EXCLUDED.impegnato_clienti, ordinato_fornitori = EXCLUDED.ordinato_fornitori,
      disponibilita = EXCLUDED.disponibilita, aggiornato_gamma = EXCLUDED.aggiornato_gamma, importazione_id = EXCLUDED.importazione_id
    RETURNING (xmax = 0) AS inserito, (t.importazione_id IS DISTINCT FROM _importazione) AS dummy
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'non_in_catalogo', v_nc, 'deposito_inesistente', v_scart);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_articoli_fornitori_gamma_lotto(_righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins integer := 0; v_upd integer := 0; v_nc integer := 0; v_nf integer := 0;
BEGIN
  IF _importazione IS NULL THEN RAISE EXCEPTION 'Importazione mancante'; END IF;
  CREATE TEMP TABLE _af ON COMMIT DROP AS
  SELECT DISTINCT ON (btrim(articolo_codice), fornitore_codice)
    btrim(articolo_codice) AS articolo_codice, fornitore_codice, COALESCE(preferenziale, false) AS preferenziale, codice_articolo_fornitore
  FROM jsonb_to_recordset(_righe) AS r(articolo_codice text, fornitore_codice integer, preferenziale boolean, codice_articolo_fornitore text)
  WHERE articolo_codice IS NOT NULL AND btrim(articolo_codice) <> '' AND fornitore_codice IS NOT NULL
  ORDER BY btrim(articolo_codice), fornitore_codice;

  SELECT count(*) INTO v_nc FROM _af s WHERE NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = s.articolo_codice);

  WITH up AS (
    INSERT INTO public.articoli_gamma_fornitori AS t (articolo_codice, fornitore_codice, fornitore_id, preferenziale, codice_articolo_fornitore, importazione_id)
    SELECT s.articolo_codice, s.fornitore_codice, f.id, s.preferenziale, s.codice_articolo_fornitore, _importazione
    FROM _af s LEFT JOIN public.fornitori f ON f.codice_gestionale = s.fornitore_codice
    ON CONFLICT (articolo_codice, fornitore_codice) DO UPDATE SET fornitore_id = EXCLUDED.fornitore_id,
      preferenziale = EXCLUDED.preferenziale, codice_articolo_fornitore = EXCLUDED.codice_articolo_fornitore,
      importazione_id = EXCLUDED.importazione_id
    RETURNING (xmax = 0) AS inserito, fornitore_id
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito), count(*) FILTER (WHERE fornitore_id IS NULL)
  INTO v_ins, v_upd, v_nf FROM up;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'non_in_catalogo', v_nc, 'fornitore_sconosciuto', v_nf);
END;
$$;

CREATE OR REPLACE FUNCTION public.chiudi_giacenze_gamma(_importazione uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF _importazione IS NULL OR NOT EXISTS (SELECT 1 FROM public.giacenze_gamma WHERE importazione_id = _importazione) THEN
    RAISE EXCEPTION 'Nessuna giacenza di questa importazione: chiusura annullata';
  END IF;
  DELETE FROM public.giacenze_gamma WHERE importazione_id IS DISTINCT FROM _importazione;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.chiudi_articoli_fornitori_gamma(_importazione uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF _importazione IS NULL OR NOT EXISTS (SELECT 1 FROM public.articoli_gamma_fornitori WHERE importazione_id = _importazione) THEN
    RAISE EXCEPTION 'Nessun legame articolo-fornitore di questa importazione: chiusura annullata';
  END IF;
  DELETE FROM public.articoli_gamma_fornitori WHERE importazione_id IS DISTINCT FROM _importazione;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

-- Unica fonte della disponibilità per sede: solo depositi 'si' per negozio, 'logistica_comune' a parte,
-- più il dettaglio di tutti i depositi con il loro flag.
CREATE OR REPLACE FUNCTION public.disponibilita_articolo(_codice text)
RETURNS TABLE (livello text, store_id uuid, nome text, deposito_codice text, conta_disponibilita text,
  giacenza numeric, impegnato_clienti numeric, ordinato_fornitori numeric, disponibilita numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.auth_mfa_ok() AND public.auth_ha_accesso_preventivi()) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH g AS (
    SELECT g.*, d.store_id AS d_store, d.conta_disponibilita AS d_conta, d.descrizione AS d_descr
    FROM public.giacenze_gamma g JOIN public.depositi d ON d.codice = g.deposito_codice
    WHERE g.articolo_codice = btrim(_codice)
  )
  SELECT 'sede'::text, g.d_store, st.nome, NULL::text, 'si'::text,
    sum(g.giacenza), sum(g.impegnato_clienti), sum(g.ordinato_fornitori), sum(g.disponibilita)
  FROM g LEFT JOIN public.stores st ON st.id = g.d_store
  WHERE g.d_conta = 'si' AND g.d_store IS NOT NULL
  GROUP BY g.d_store, st.nome
  UNION ALL
  SELECT 'logistica_comune', NULL::uuid, 'Logistica comune', NULL, 'logistica_comune',
    sum(g.giacenza), sum(g.impegnato_clienti), sum(g.ordinato_fornitori), sum(g.disponibilita)
  FROM g WHERE g.d_conta = 'logistica_comune' HAVING count(*) > 0
  UNION ALL
  SELECT 'deposito', g.d_store, g.d_descr, g.deposito_codice, g.d_conta,
    g.giacenza, g.impegnato_clienti, g.ordinato_fornitori, g.disponibilita
  FROM g;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_depositi_gamma(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_depositi_gamma(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_giacenze_gamma_lotto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_giacenze_gamma_lotto(jsonb, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_fornitori_gamma_lotto(jsonb, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.chiudi_giacenze_gamma(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chiudi_giacenze_gamma(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.chiudi_articoli_fornitori_gamma(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chiudi_articoli_fornitori_gamma(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.disponibilita_articolo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disponibilita_articolo(text) TO authenticated, service_role;