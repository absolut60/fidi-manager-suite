-- FM61 fetta 3B: regole prezzo Gamma, import fedele (nessun calcolo, nessun legame col preventivatore).
CREATE TABLE public.listini_gamma (
  codice smallint PRIMARY KEY,
  descrizione text NOT NULL,
  note text
);

CREATE TABLE public.listini_priorita_gamma (
  priorita integer PRIMARY KEY,
  tipo_listino text,
  livello text,
  gestione_prezzo integer,
  sc1 integer, sc2 integer, sc3 integer, sc4 integer, sc5 integer, sc6 integer,
  sconto_importo integer,
  mag1 integer, mag2 integer,
  magg_importo integer,
  importazione_id uuid
);

CREATE TABLE public.clienti_condizioni_gamma (
  cliente_codice integer PRIMARY KEY,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  listino smallint,
  macrocategoria text,
  categoria text,
  sottocategoria text,
  listino_piu_articoli text,
  sc1_cliente numeric, sc2_cliente numeric, sc3_cliente numeric,
  sconto_piede numeric,
  importazione_id uuid
);
CREATE INDEX clienti_condizioni_gamma_cliente_idx ON public.clienti_condizioni_gamma (cliente_id);

CREATE TABLE public.sconti_categoria_gamma (
  id integer PRIMARY KEY,
  macrocategoria text,
  categoria text,
  sottocategoria text NOT NULL DEFAULT '',
  listino smallint,
  valido_dal date, valido_al date,
  sc1 numeric, sc2 numeric, sc4 numeric,
  sconto_importo numeric,
  mag1 numeric, mag2 numeric,
  magg_importo numeric,
  importazione_id uuid
);
COMMENT ON COLUMN public.sconti_categoria_gamma.sottocategoria IS '''''= nessuna sottocategoria';
COMMENT ON COLUMN public.sconti_categoria_gamma.listino IS 'NULL = tutti i listini';

CREATE TABLE public.sconti_cliente_famiglia_gamma (
  id integer PRIMARY KEY,
  cliente_codice integer,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  da_famiglia text, da_sottofamiglia text, da_gruppo text, da_sottogruppo text,
  a_famiglia text, a_sottofamiglia text, a_gruppo text, a_sottogruppo text,
  valido_dal date, valido_al date,
  sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric, sc5 numeric, sc6 numeric,
  importazione_id uuid
);
CREATE INDEX sconti_cliente_famiglia_gamma_cliente_idx ON public.sconti_cliente_famiglia_gamma (cliente_id);

CREATE TABLE public.listino_piu_articoli_gamma (
  id integer PRIMARY KEY,
  codice_listino text,
  articolo_codice text,
  valido_dal date, valido_al date,
  prezzo numeric, sc1 numeric,
  importazione_id uuid
);
CREATE INDEX listino_piu_articoli_gamma_articolo_idx ON public.listino_piu_articoli_gamma (articolo_codice);

CREATE TABLE public.prezzi_cliente_articolo_gamma (
  id integer PRIMARY KEY,
  cliente_codice integer,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  articolo_codice text,
  valido_dal date, valido_al date,
  prezzo numeric,
  sc1 numeric, sc2 numeric, sc3 numeric, sc4 numeric, sc5 numeric, sc6 numeric,
  sconto_importo numeric, mag1 numeric,
  importazione_id uuid
);
CREATE INDEX prezzi_cliente_articolo_gamma_cliente_idx ON public.prezzi_cliente_articolo_gamma (cliente_id);
CREATE INDEX prezzi_cliente_articolo_gamma_articolo_idx ON public.prezzi_cliente_articolo_gamma (articolo_codice);

CREATE TABLE public.prezzi_deposito_gamma (
  id integer PRIMARY KEY,
  articolo_codice text,
  listino smallint,
  deposito_codice text REFERENCES public.depositi(codice),
  valido_dal date,
  prezzo numeric, sc1 numeric, sc2 numeric, sc3 numeric, mag1 numeric,
  prezzo_netto numeric,
  importazione_id uuid
);
CREATE INDEX prezzi_deposito_gamma_articolo_idx ON public.prezzi_deposito_gamma (articolo_codice);
CREATE INDEX prezzi_deposito_gamma_deposito_idx ON public.prezzi_deposito_gamma (deposito_codice);

GRANT SELECT ON public.listini_gamma, public.listini_priorita_gamma, public.clienti_condizioni_gamma,
  public.sconti_categoria_gamma, public.sconti_cliente_famiglia_gamma, public.listino_piu_articoli_gamma,
  public.prezzi_cliente_articolo_gamma, public.prezzi_deposito_gamma TO authenticated;
GRANT ALL ON public.listini_gamma, public.listini_priorita_gamma, public.clienti_condizioni_gamma,
  public.sconti_categoria_gamma, public.sconti_cliente_famiglia_gamma, public.listino_piu_articoli_gamma,
  public.prezzi_cliente_articolo_gamma, public.prezzi_deposito_gamma TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['listini_gamma','listini_priorita_gamma','clienti_condizioni_gamma','sconti_categoria_gamma',
    'sconti_cliente_famiglia_gamma','listino_piu_articoli_gamma','prezzi_cliente_articolo_gamma','prezzi_deposito_gamma'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Secondo fattore (FM44)" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()))', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.auth_ha_accesso_preventivi()))', t || '_select', t);
  END LOOP;
END $$;

-- Anagrafica dei listini (fissa, non dall'import).
INSERT INTO public.listini_gamma (codice, descrizione, note) VALUES
  (10, 'Lombardia', NULL),
  (20, 'Piemonte', NULL),
  (30, 'Applicatori', NULL),
  (9, 'Transitorio Saviedil', 'Listino transitorio per l''acquisizione Saviedil; verrà sostituito dal 20 Piemonte. È presente su quasi tutti gli articoli ma questo non ha significato')
ON CONFLICT (codice) DO NOTHING;

ALTER TABLE public.articoli_gamma_listini
  ADD CONSTRAINT articoli_gamma_listini_listino_fkey FOREIGN KEY (listino) REFERENCES public.listini_gamma(codice);

-- Sostituzione completa di un foglio regole in una transazione. Solo tabelle in elenco; elenco vuoto → nessuna cancellazione.
CREATE OR REPLACE FUNCTION public.sostituisci_regole_prezzo_gamma(_tabella text, _righe jsonb, _importazione uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_righe integer := 0; v_cnf integer := 0; v_nc integer := 0; v_dep integer := 0;
  v_ha_cliente boolean; v_ha_articolo boolean;
BEGIN
  IF _tabella NOT IN ('listini_priorita_gamma','clienti_condizioni_gamma','sconti_categoria_gamma','sconti_cliente_famiglia_gamma',
                      'listino_piu_articoli_gamma','prezzi_cliente_articolo_gamma','prezzi_deposito_gamma') THEN
    RAISE EXCEPTION 'Tabella non ammessa: %', _tabella;
  END IF;
  IF _righe IS NULL OR jsonb_typeof(_righe) <> 'array' OR jsonb_array_length(_righe) = 0 THEN
    RAISE EXCEPTION 'Foglio vuoto: sostituzione annullata';
  END IF;
  v_ha_cliente := _tabella IN ('clienti_condizioni_gamma','sconti_cliente_famiglia_gamma','prezzi_cliente_articolo_gamma');
  v_ha_articolo := _tabella IN ('listino_piu_articoli_gamma','prezzi_cliente_articolo_gamma','prezzi_deposito_gamma');

  EXECUTE format('DELETE FROM public.%I WHERE true', _tabella);

  IF _tabella = 'prezzi_deposito_gamma' THEN
    SELECT count(*) INTO v_dep FROM jsonb_populate_recordset(NULL::public.prezzi_deposito_gamma, _righe) r
    WHERE r.deposito_codice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = r.deposito_codice);
    INSERT INTO public.prezzi_deposito_gamma
    SELECT (r).* FROM (SELECT (jsonb_populate_record(NULL::public.prezzi_deposito_gamma, e || jsonb_build_object('importazione_id', _importazione))) AS r
                       FROM jsonb_array_elements(_righe) e) x
    WHERE (r).deposito_codice IS NULL OR EXISTS (SELECT 1 FROM public.depositi d WHERE d.codice = (r).deposito_codice);
  ELSE
    EXECUTE format('INSERT INTO public.%1$I SELECT (r).* FROM (SELECT jsonb_populate_record(NULL::public.%1$I, e || jsonb_build_object(''importazione_id'', $2)) AS r FROM jsonb_array_elements($1) e) x', _tabella)
      USING _righe, _importazione;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', _tabella) INTO v_righe;

  IF v_ha_cliente THEN
    EXECUTE format('UPDATE public.%I t SET cliente_id = c.id FROM public.clienti c WHERE c.codice_gestionale = t.cliente_codice::text', _tabella);
    EXECUTE format('SELECT count(DISTINCT cliente_codice) FROM public.%I WHERE cliente_codice IS NOT NULL AND cliente_id IS NULL', _tabella) INTO v_cnf;
  END IF;
  IF v_ha_articolo THEN
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE t.articolo_codice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.articoli_gamma a WHERE a.codice = t.articolo_codice)', _tabella) INTO v_nc;
  END IF;

  RETURN jsonb_build_object('righe', v_righe, 'clienti_non_trovati', v_cnf, 'non_in_catalogo', v_nc, 'deposito_inesistente', v_dep);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sostituisci_regole_prezzo_gamma(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sostituisci_regole_prezzo_gamma(text, jsonb, uuid) TO service_role;
