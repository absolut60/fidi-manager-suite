CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.marche (
  codice text PRIMARY KEY,
  descrizione text,
  attivo boolean NOT NULL DEFAULT true,
  ultima_sincronizzazione timestamptz
);

CREATE TABLE public.articoli_gamma (
  codice text PRIMARY KEY,
  descrizione text,
  descrizione_estesa text,
  codice_famiglia text,
  famiglia text,
  codice_sottofamiglia text,
  sottofamiglia text,
  marca_codice text REFERENCES public.marche(codice),
  um text,
  um2 text,
  fattore_conversione numeric,
  iva text,
  peso_netto numeric,
  stato_gamma text CHECK (stato_gamma IN ('in_uso','in_esaurimento')),
  data_creazione_gamma date,
  data_aggiornamento_gamma date,
  premio_fornitore text,
  codice_a_barre text,
  fornitore_pref_codice integer,
  fornitore_pref_id uuid REFERENCES public.fornitori(id) ON DELETE SET NULL,
  codice_articolo_fornitore text,
  n_fornitori integer,
  costo_ultimo numeric,
  costo_medio numeric,
  costo_fifo numeric,
  attivo boolean NOT NULL DEFAULT true,
  ultima_sincronizzazione timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX articoli_gamma_marca_idx ON public.articoli_gamma (marca_codice);
CREATE INDEX articoli_gamma_famiglia_idx ON public.articoli_gamma (codice_famiglia);
CREATE INDEX articoli_gamma_sottofamiglia_idx ON public.articoli_gamma (codice_sottofamiglia);
CREATE INDEX articoli_gamma_fornitore_pref_idx ON public.articoli_gamma (fornitore_pref_id);
CREATE INDEX articoli_gamma_barre_idx ON public.articoli_gamma (codice_a_barre);
CREATE INDEX articoli_gamma_descrizione_trgm ON public.articoli_gamma USING gin (descrizione extensions.gin_trgm_ops);
CREATE TRIGGER trg_articoli_gamma_updated_at BEFORE UPDATE ON public.articoli_gamma
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.articoli_gamma_listini (
  articolo_codice text NOT NULL REFERENCES public.articoli_gamma(codice) ON DELETE CASCADE,
  listino smallint NOT NULL CHECK (listino IN (9,10,20,30)),
  prezzo_vendita numeric,
  costo_acquisto numeric,
  PRIMARY KEY (articolo_codice, listino)
);

GRANT SELECT ON public.marche, public.articoli_gamma, public.articoli_gamma_listini TO authenticated;
GRANT ALL ON public.marche, public.articoli_gamma, public.articoli_gamma_listini TO service_role;

ALTER TABLE public.marche ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articoli_gamma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articoli_gamma_listini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Secondo fattore (FM44)" ON public.marche AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY marche_select ON public.marche FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));
CREATE POLICY "Secondo fattore (FM44)" ON public.articoli_gamma AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY articoli_gamma_select ON public.articoli_gamma FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));
CREATE POLICY "Secondo fattore (FM44)" ON public.articoli_gamma_listini AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY articoli_gamma_listini_select ON public.articoli_gamma_listini FOR SELECT TO authenticated
  USING ((SELECT public.auth_ha_accesso_preventivi()));

CREATE OR REPLACE FUNCTION public.import_marche_gamma(_righe jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  INSERT INTO public.marche AS m (codice, descrizione, attivo, ultima_sincronizzazione)
  SELECT DISTINCT ON (codice) codice, descrizione, true, now()
  FROM jsonb_to_recordset(_righe) AS r(codice text, descrizione text)
  WHERE codice IS NOT NULL AND codice <> ''
  ORDER BY codice
  ON CONFLICT (codice) DO UPDATE SET descrizione = EXCLUDED.descrizione, attivo = true,
    ultima_sincronizzazione = now();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_articoli_gamma_lotto(_righe jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ins integer := 0; v_upd integer := 0; v_lis integer := 0;
BEGIN
  CREATE TEMP TABLE _ag ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_righe) AS r(
    codice text, descrizione text, descrizione_estesa text, codice_famiglia text, famiglia text,
    codice_sottofamiglia text, sottofamiglia text, marca_codice text, um text, um2 text,
    fattore_conversione numeric, iva text, peso_netto numeric, stato_gamma text,
    data_creazione_gamma date, data_aggiornamento_gamma date, premio_fornitore text,
    codice_a_barre text, fornitore_pref_codice integer, codice_articolo_fornitore text,
    n_fornitori integer, costo_ultimo numeric, costo_medio numeric, costo_fifo numeric, listini jsonb)
  WHERE codice IS NOT NULL AND codice <> '';

  -- Marche citate ma assenti: create senza descrizione (la FK non deve far fallire il lotto).
  INSERT INTO public.marche (codice, ultima_sincronizzazione)
  SELECT DISTINCT marca_codice, now() FROM _ag WHERE marca_codice IS NOT NULL
  ON CONFLICT (codice) DO NOTHING;

  WITH up AS (
    INSERT INTO public.articoli_gamma AS a (
      codice, descrizione, descrizione_estesa, codice_famiglia, famiglia, codice_sottofamiglia, sottofamiglia,
      marca_codice, um, um2, fattore_conversione, iva, peso_netto, stato_gamma, data_creazione_gamma,
      data_aggiornamento_gamma, premio_fornitore, codice_a_barre, fornitore_pref_codice, fornitore_pref_id,
      codice_articolo_fornitore, n_fornitori, costo_ultimo, costo_medio, costo_fifo, attivo, ultima_sincronizzazione)
    SELECT s.codice, s.descrizione, s.descrizione_estesa, s.codice_famiglia, s.famiglia, s.codice_sottofamiglia, s.sottofamiglia,
      s.marca_codice, s.um, s.um2, s.fattore_conversione, s.iva, s.peso_netto, s.stato_gamma, s.data_creazione_gamma,
      s.data_aggiornamento_gamma, s.premio_fornitore, s.codice_a_barre, s.fornitore_pref_codice, f.id,
      s.codice_articolo_fornitore, s.n_fornitori, s.costo_ultimo, s.costo_medio, s.costo_fifo, true, now()
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
      costo_fifo = EXCLUDED.costo_fifo, attivo = true, ultima_sincronizzazione = now()
    RETURNING (xmax = 0) AS inserito
  )
  SELECT count(*) FILTER (WHERE inserito), count(*) FILTER (WHERE NOT inserito) INTO v_ins, v_upd FROM up;

  DELETE FROM public.articoli_gamma_listini l USING _ag s WHERE l.articolo_codice = s.codice;
  INSERT INTO public.articoli_gamma_listini (articolo_codice, listino, prezzo_vendita, costo_acquisto)
  SELECT s.codice, x.listino, x.prezzo_vendita, x.costo_acquisto
  FROM _ag s
  CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(s.listini, '[]'::jsonb)) AS x(listino smallint, prezzo_vendita numeric, costo_acquisto numeric)
  WHERE x.prezzo_vendita IS NOT NULL OR x.costo_acquisto IS NOT NULL
  ON CONFLICT (articolo_codice, listino) DO NOTHING;
  GET DIAGNOSTICS v_lis = ROW_COUNT;

  RETURN jsonb_build_object('inseriti', v_ins, 'aggiornati', v_upd, 'listini', v_lis);
END;
$$;

CREATE OR REPLACE FUNCTION public.disattiva_articoli_gamma_assenti(_codici text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF _codici IS NULL OR cardinality(_codici) = 0 THEN
    RAISE EXCEPTION 'Elenco codici vuoto: disattivazione annullata';
  END IF;
  UPDATE public.articoli_gamma SET attivo = false
  WHERE attivo = true AND NOT (codice = ANY (_codici));
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_marche_gamma(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_marche_gamma(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_articoli_gamma_lotto(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.disattiva_articoli_gamma_assenti(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disattiva_articoli_gamma_assenti(text[]) TO service_role;