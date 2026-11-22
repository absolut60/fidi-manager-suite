CREATE OR REPLACE FUNCTION public.auth_puo_esportare_gamma()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- Gemello di RUOLI_ESPORTAZIONE_GAMMA in src/lib/esportazione-gamma.ts.
  SELECT public.auth_mfa_ok() AND (
    public.has_role(auth.uid(), 'amministratore') OR
    public.has_role(auth.uid(), 'responsabile_showroom')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.auth_puo_esportare_gamma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_esportare_gamma() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acquisti_gamma_ordini(_ordine_ids uuid[])
RETURNS TABLE(articolo_codice text, listino smallint, acq_prezzo numeric, acq_sc1 numeric, acq_sc2 numeric, acq_sc3 numeric, acq_trasporto_perc numeric, acq_trasporto_euro numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.articolo_codice, a.listino, a.acq_prezzo, a.acq_sc1, a.acq_sc2, a.acq_sc3, a.acq_trasporto_perc, a.acq_trasporto_euro
  FROM public.articoli_gamma_listini a
  WHERE a.listino <> 9 AND a.articolo_codice IN (
    SELECT r.articolo_codice FROM public.righe_preventivo r
    JOIN public.blocchi_preventivo b ON b.id = r.blocco_id
    JOIN public.preventivi p ON p.id = b.preventivo_id
    WHERE p.id = ANY(_ordine_ids) AND p.tipo = 'ordine' AND public.auth_vede_preventivo_id(p.id)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acquisti_gamma_ordini(uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.acquisti_gamma_ordini(uuid[]) TO authenticated;

CREATE TABLE public.esportazioni_gamma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creata_at timestamptz NOT NULL DEFAULT now(),
  creata_da uuid NOT NULL,
  nome_file text NOT NULL,
  file_path text NOT NULL,
  n_ordini int NOT NULL,
  n_documenti_fornitore int NOT NULL,
  n_documenti_cliente int NOT NULL
);
GRANT SELECT ON public.esportazioni_gamma TO authenticated;
GRANT ALL ON public.esportazioni_gamma TO service_role;
ALTER TABLE public.esportazioni_gamma ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gamma: lettura storico" ON public.esportazioni_gamma FOR SELECT TO authenticated USING ((SELECT public.auth_puo_esportare_gamma()));
CREATE POLICY "Secondo fattore (FM44)" ON public.esportazioni_gamma AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));

ALTER TABLE public.preventivi
  ADD COLUMN esportato_gamma_at timestamptz,
  ADD COLUMN esportato_gamma_da uuid,
  ADD COLUMN esportazione_gamma_id uuid REFERENCES public.esportazioni_gamma(id);

CREATE TABLE public.esportazioni_gamma_eventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  esportazione_id uuid REFERENCES public.esportazioni_gamma(id),
  ordine_id uuid REFERENCES public.preventivi(id) ON DELETE SET NULL,
  numero_ordine text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('esportato', 'riaperto')),
  utente uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  motivo text
);
GRANT SELECT ON public.esportazioni_gamma_eventi TO authenticated;
GRANT ALL ON public.esportazioni_gamma_eventi TO service_role;
ALTER TABLE public.esportazioni_gamma_eventi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gamma: lettura eventi" ON public.esportazioni_gamma_eventi FOR SELECT TO authenticated USING ((SELECT public.auth_puo_esportare_gamma()));
CREATE POLICY "Secondo fattore (FM44)" ON public.esportazioni_gamma_eventi AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE INDEX esportazioni_gamma_eventi_ordine_idx ON public.esportazioni_gamma_eventi(ordine_id, at);
CREATE INDEX esportazioni_gamma_eventi_esportazione_idx ON public.esportazioni_gamma_eventi(esportazione_id);
CREATE INDEX preventivi_esportazione_gamma_idx ON public.preventivi(esportazione_gamma_id) WHERE esportazione_gamma_id IS NOT NULL;

CREATE POLICY "Gamma: lettura file" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'esportazioni-gamma' AND (SELECT public.auth_puo_esportare_gamma()));
CREATE POLICY "Gamma: caricamento file" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'esportazioni-gamma' AND (SELECT public.auth_puo_esportare_gamma()) AND owner_id = (SELECT auth.uid())::text);
CREATE POLICY "Gamma: rimozione proprio file non registrato" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'esportazioni-gamma' AND (SELECT public.auth_puo_esportare_gamma()) AND owner_id = (SELECT auth.uid())::text
  AND NOT EXISTS (SELECT 1 FROM public.esportazioni_gamma e WHERE e.file_path = objects.name));

CREATE OR REPLACE FUNCTION public.registra_esportazione_gamma(_ordine_ids uuid[], _nome_file text, _file_path text, _n_doc_fornitore int, _n_doc_cliente int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
  v_p public.preventivi%ROWTYPE;
  v_errori text[] := '{}';
  v_id uuid;
  v_flag text := current_setting('app.gamma_scrittura', true);
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF _ordine_ids IS NULL OR cardinality(_ordine_ids) = 0 OR array_position(_ordine_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Seleziona almeno un ordine valido';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM (SELECT DISTINCT unnest(_ordine_ids) id) x;
  IF NULLIF(btrim(_nome_file), '') IS NULL OR NULLIF(btrim(_file_path), '') IS NULL
     OR _n_doc_fornitore IS NULL OR _n_doc_cliente IS NULL OR _n_doc_fornitore < 0 OR _n_doc_cliente < 0 THEN
    RAISE EXCEPTION 'Dati del file Gamma non validi';
  END IF;
  -- Lock in ordine stabile, prima di qualsiasi scrittura.
  PERFORM p.id FROM public.preventivi p WHERE p.id = ANY(v_ids) ORDER BY p.id FOR UPDATE;
  FOR v_id IN SELECT unnest(v_ids) LOOP
    SELECT * INTO v_p FROM public.preventivi WHERE id = v_id;
    IF NOT FOUND THEN
      v_errori := array_append(v_errori, v_id::text || ': inesistente');
    ELSIF NOT COALESCE(public.auth_vede_preventivo_id(v_id), false) THEN
      v_errori := array_append(v_errori, v_id::text || ': non visibile');
    ELSIF v_p.tipo <> 'ordine' THEN
      v_errori := array_append(v_errori, COALESCE(v_p.numero, v_id::text) || ': non è un ordine');
    ELSIF v_p.esportato_gamma_at IS NOT NULL THEN
      v_errori := array_append(v_errori, COALESCE(v_p.numero, v_id::text) || ': già esportato');
    END IF;
  END LOOP;
  IF cardinality(v_errori) > 0 THEN
    RAISE EXCEPTION 'Esportazione Gamma annullata: %', array_to_string(v_errori, '; ');
  END IF;
  INSERT INTO public.esportazioni_gamma(creata_da, nome_file, file_path, n_ordini, n_documenti_fornitore, n_documenti_cliente)
  VALUES(auth.uid(), _nome_file, _file_path, cardinality(v_ids), _n_doc_fornitore, _n_doc_cliente) RETURNING id INTO v_id;
  PERFORM set_config('app.gamma_scrittura', 'rpc', true);
  UPDATE public.preventivi SET esportato_gamma_at = now(), esportato_gamma_da = auth.uid(), esportazione_gamma_id = v_id WHERE id = ANY(v_ids);
  INSERT INTO public.esportazioni_gamma_eventi(esportazione_id, ordine_id, numero_ordine, tipo, utente)
  SELECT v_id, id, numero, 'esportato', auth.uid() FROM public.preventivi WHERE id = ANY(v_ids);
  PERFORM set_config('app.gamma_scrittura', COALESCE(v_flag, ''), true);
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registra_esportazione_gamma(uuid[], text, text, int, int) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registra_esportazione_gamma(uuid[], text, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.riapri_ordine_gamma(_ordine_id uuid, _motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_p public.preventivi%ROWTYPE; v_flag text := current_setting('app.gamma_scrittura', true);
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.preventivi WHERE id = _ordine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine inesistente'; END IF;
  IF NOT COALESCE(public.auth_vede_preventivo_id(_ordine_id), false) THEN RAISE EXCEPTION 'Ordine non visibile' USING ERRCODE = '42501'; END IF;
  IF v_p.tipo <> 'ordine' THEN RAISE EXCEPTION 'Il documento % non è un ordine', v_p.numero; END IF;
  IF v_p.esportato_gamma_at IS NULL THEN RAISE EXCEPTION 'Ordine % non esportato in Gamma', v_p.numero; END IF;
  PERFORM set_config('app.gamma_scrittura', 'rpc', true);
  UPDATE public.preventivi SET esportato_gamma_at = NULL, esportato_gamma_da = NULL, esportazione_gamma_id = NULL WHERE id = _ordine_id;
  INSERT INTO public.esportazioni_gamma_eventi(esportazione_id, ordine_id, numero_ordine, tipo, utente, motivo)
  VALUES(v_p.esportazione_gamma_id, v_p.id, v_p.numero, 'riaperto', auth.uid(), NULLIF(btrim(_motivo), ''));
  PERFORM set_config('app.gamma_scrittura', COALESCE(v_flag, ''), true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.riapri_ordine_gamma(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.riapri_ordine_gamma(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.blocca_ordine_esportato_gamma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid;
  v_new uuid;
  v_p public.preventivi%ROWTYPE;
  v_servizio text[] := ARRAY['esportato_gamma_at','esportato_gamma_da','esportazione_gamma_id','updated_at','cliente_id','lead_id','lead_origine_id'];
BEGIN
  IF current_setting('role', true) = 'service_role' OR COALESCE(auth.role(), '') = 'service_role'
     OR (current_setting('app.gamma_scrittura', true) = 'rpc' AND COALESCE(public.auth_puo_esportare_gamma(), false)) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'preventivi' THEN
    IF OLD.tipo = 'ordine' AND OLD.esportato_gamma_at IS NOT NULL THEN
      IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_servizio) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_servizio) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'blocchi_preventivo' THEN
      IF TG_OP <> 'INSERT' THEN v_old := OLD.preventivo_id; END IF;
      IF TG_OP <> 'DELETE' THEN v_new := NEW.preventivo_id; END IF;
    ELSE
      IF TG_OP <> 'INSERT' THEN SELECT preventivo_id INTO v_old FROM public.blocchi_preventivo WHERE id = OLD.blocco_id; END IF;
      IF TG_OP <> 'DELETE' THEN SELECT preventivo_id INTO v_new FROM public.blocchi_preventivo WHERE id = NEW.blocco_id; END IF;
    END IF;
    FOR v_p IN SELECT p.* FROM public.preventivi p WHERE p.id IN (v_old, v_new) ORDER BY p.id FOR UPDATE LOOP
      IF v_p.tipo = 'ordine' AND v_p.esportato_gamma_at IS NOT NULL THEN
        RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.blocca_ordine_esportato_gamma() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocca_ordine_esportato_gamma() TO service_role;
CREATE TRIGGER z_preventivi_blocco_gamma BEFORE UPDATE OR DELETE ON public.preventivi FOR EACH ROW EXECUTE FUNCTION public.blocca_ordine_esportato_gamma();
CREATE TRIGGER z_blocchi_blocco_gamma BEFORE INSERT OR UPDATE OR DELETE ON public.blocchi_preventivo FOR EACH ROW EXECUTE FUNCTION public.blocca_ordine_esportato_gamma();
CREATE TRIGGER z_righe_blocco_gamma BEFORE INSERT OR UPDATE OR DELETE ON public.righe_preventivo FOR EACH ROW EXECUTE FUNCTION public.blocca_ordine_esportato_gamma();
