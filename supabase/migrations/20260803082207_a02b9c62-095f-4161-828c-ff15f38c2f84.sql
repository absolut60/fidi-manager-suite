CREATE OR REPLACE FUNCTION public.converti_lead_in_cliente(_lead_id uuid, _forza_duplicato boolean DEFAULT false)
RETURNS TABLE(cliente_id uuid, duplicati jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.lead%ROWTYPE;
  v_cliente_id uuid;
  v_dups jsonb;
  v_ragione text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'amministratore') THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NOT NULL OR v_lead.stato = 'convertito' THEN
    RAISE EXCEPTION 'Lead già convertito';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'ragione_sociale', c.ragione_sociale, 'partita_iva', c.partita_iva, 'codice_fiscale', c.codice_fiscale))
    INTO v_dups
  FROM public.clienti c
  WHERE (
      c.partita_iva = v_lead.partita_iva
      AND coalesce(btrim(v_lead.partita_iva), '') <> ''
      AND v_lead.partita_iva NOT IN ('102730','102729')
    )
    OR (
      c.codice_fiscale = v_lead.codice_fiscale
      AND coalesce(btrim(v_lead.codice_fiscale), '') <> ''
    );

  IF v_dups IS NOT NULL AND NOT _forza_duplicato THEN
    RETURN QUERY SELECT NULL::uuid, v_dups;
    RETURN;
  END IF;

  v_ragione := COALESCE(
    NULLIF(btrim(coalesce(v_lead.ragione_sociale, '')), ''),
    NULLIF(btrim(coalesce(v_lead.nome, '') || ' ' || coalesce(v_lead.cognome, '')), '')
  );
  IF v_ragione IS NULL THEN
    RAISE EXCEPTION 'Il lead non ha né ragione sociale né nome/cognome: impossibile creare il cliente';
  END IF;

  INSERT INTO public.clienti (
    ragione_sociale, partita_iva, codice_fiscale, tipo_soggetto,
    indirizzo, citta, cap, provincia, telefono, cellulare, email, note, created_by
  ) VALUES (
    v_ragione,
    NULLIF(btrim(coalesce(v_lead.partita_iva, '')), ''),
    NULLIF(btrim(coalesce(v_lead.codice_fiscale, '')), ''),
    v_lead.tipo_soggetto,
    NULLIF(btrim(coalesce(v_lead.indirizzo, '')), ''),
    NULLIF(btrim(coalesce(v_lead.citta, '')), ''),
    NULLIF(btrim(coalesce(v_lead.cap, '')), ''),
    NULLIF(btrim(coalesce(v_lead.provincia, '')), ''),
    NULLIF(btrim(coalesce(v_lead.telefono, '')), ''),
    NULLIF(btrim(coalesce(v_lead.cellulare, '')), ''),
    NULLIF(btrim(coalesce(v_lead.email, '')), ''),
    v_lead.note,
    auth.uid()
  ) RETURNING id INTO v_cliente_id;

  UPDATE public.contatti SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;
  UPDATE public.cantieri SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;
  UPDATE public.consensi_log SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, v_lead.stato::text, 'convertito', auth.uid(), 'Convertito in cliente ' || v_cliente_id);

  UPDATE public.lead
     SET cliente_id = v_cliente_id, convertito_il = now(), convertito_da = auth.uid(), stato = 'convertito'
   WHERE id = _lead_id;

  RETURN QUERY SELECT v_cliente_id, NULL::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.converti_lead_in_cliente(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.converti_lead_in_cliente(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.annulla_conversione_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.lead%ROWTYPE;
  v_cliente uuid;
  v_parts text[] := '{}';
  v_tot bigint := 0;
  v_n bigint;
  t text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'amministratore') THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Lead non convertito';
  END IF;
  v_cliente := v_lead.cliente_id;

  FOREACH t IN ARRAY ARRAY['scadenze','richieste_fido','azioni_recupero','pratiche_legali','assicurazioni_credito','piani_rientro','storico_fido','solleciti','note_legali_gestionali']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE cliente_id = $1', t) INTO v_n USING v_cliente;
    IF v_n > 0 THEN
      v_parts := v_parts || (t || ': ' || v_n);
      v_tot := v_tot + v_n;
    END IF;
  END LOOP;

  IF v_tot > 0 THEN
    RAISE EXCEPTION 'Impossibile annullare: il cliente ha già dati collegati (%). Annullamento bloccato per non perdere dati.', array_to_string(v_parts, ', ');
  END IF;

  UPDATE public.contatti SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
  UPDATE public.cantieri SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
  UPDATE public.consensi_log SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;

  UPDATE public.lead
     SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'qualificato'
   WHERE id = _lead_id;

  DELETE FROM public.clienti WHERE id = v_cliente;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, 'convertito', 'qualificato', auth.uid(), 'Conversione annullata, cliente ' || v_cliente || ' eliminato');
END;
$$;

REVOKE ALL ON FUNCTION public.annulla_conversione_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annulla_conversione_lead(uuid) TO authenticated;