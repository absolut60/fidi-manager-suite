-- 1) Nuova colonna lead.conversione_tipo
ALTER TABLE public.lead ADD COLUMN conversione_tipo text NULL;
ALTER TABLE public.lead ADD CONSTRAINT lead_conversione_tipo_chk
  CHECK (conversione_tipo IS NULL OR conversione_tipo IN ('nuovo_cliente','contatto_cliente'));
COMMENT ON COLUMN public.lead.conversione_tipo IS 'FM38: come è stato chiuso il lead convertito. nuovo_cliente = la conversione ha creato il cliente; contatto_cliente = collegato come contatto a un cliente che esisteva già. NULL = non convertito, oppure conversione precedente a FM38 (da trattare come nuovo_cliente).';

-- 2) converti_lead_in_cliente: identica, ma l''UPDATE finale imposta anche conversione_tipo = ''nuovo_cliente''
CREATE OR REPLACE FUNCTION public.converti_lead_in_cliente(_lead_id uuid, _forza_duplicato boolean DEFAULT false)
 RETURNS TABLE(cliente_id uuid, duplicati jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    indirizzo, citta, cap, provincia, telefono, cellulare, email, note, mestiere_id, created_by
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
    v_lead.mestiere_id,
    auth.uid()
  ) RETURNING id INTO v_cliente_id;

  UPDATE public.contatti SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;
  UPDATE public.cantieri SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;
  UPDATE public.consensi_log SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;
  UPDATE public.opportunita SET cliente_id = v_cliente_id WHERE lead_id = _lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, v_lead.stato::text, 'convertito', auth.uid(), 'Convertito in cliente ' || v_cliente_id);

  UPDATE public.lead
     SET cliente_id = v_cliente_id, convertito_il = now(), convertito_da = auth.uid(), stato = 'convertito', conversione_tipo = 'nuovo_cliente'
   WHERE id = _lead_id;

  RETURN QUERY SELECT v_cliente_id, NULL::jsonb;
END;
$function$;

-- 3) Nuova collega_lead_a_cliente
CREATE OR REPLACE FUNCTION public.collega_lead_a_cliente(_lead_id uuid, _cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_lead public.lead%ROWTYPE;
  v_cliente record;
  ct record;
  v_eq uuid;
  v_finale uuid;
  v_spostati int := 0;
  v_uniti int := 0;
  v_creati int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT * INTO v_lead FROM public.lead WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;
  IF v_lead.cliente_id IS NOT NULL OR v_lead.stato = 'convertito' THEN
    RAISE EXCEPTION 'Lead già convertito';
  END IF;

  SELECT ragione_sociale, codice_gestionale INTO v_cliente FROM public.clienti WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;

  -- Contatti del lead: spostamento oppure unione con contatto equivalente del cliente
  FOR ct IN SELECT * FROM public.contatti WHERE lead_id = _lead_id AND cliente_id IS NULL ORDER BY created_at
  LOOP
    v_eq := public.trova_contatto_equivalente(_cliente_id, NULL, ct.nome, ct.cognome, ct.email, ct.cellulare, ct.codice_fiscale);
    IF v_eq IS NULL THEN
      UPDATE public.contatti SET cliente_id = _cliente_id WHERE id = ct.id;
      v_finale := ct.id;
      v_spostati := v_spostati + 1;
    ELSE
      PERFORM public.trasferisci_privacy_contatto(ct.id, v_eq);
      UPDATE public.contatti d SET email = coalesce(d.email, ct.email), cellulare = coalesce(d.cellulare, ct.cellulare), codice_fiscale = coalesce(d.codice_fiscale, ct.codice_fiscale) WHERE d.id = v_eq;
      UPDATE public.eventi_partecipanti SET contatto_id = v_eq WHERE contatto_id = ct.id;
      -- messaggi_whatsapp ha il vincolo messaggi_whatsapp_uniq_dest UNIQUE (campagna_id, contatto_id):
      -- i messaggi di una campagna già registrata sul contatto esistente non vengono spostati
      -- e seguono la cancellazione del contatto del lead (lo storico di quella campagna resta sul contatto esistente).
      UPDATE public.messaggi_whatsapp m SET contatto_id = v_eq
       WHERE m.contatto_id = ct.id
         AND (m.campagna_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM public.messaggi_whatsapp x WHERE x.contatto_id = v_eq AND x.campagna_id = m.campagna_id));
      UPDATE public.campagne_email_destinatari SET contatto_id = v_eq WHERE contatto_id = ct.id;
      DELETE FROM public.contatti WHERE id = ct.id;
      v_finale := v_eq;
      v_uniti := v_uniti + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM public.get_stato_consensi(ARRAY[v_finale]) sc WHERE sc.whatsapp) THEN
      BEGIN
        PERFORM public.upsert_iscritto_da_contatto(v_finale);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  -- Lead senza contatti ma con nome e cognome: crea (o riusa) il contatto nel cliente
  IF v_spostati = 0 AND v_uniti = 0
     AND NULLIF(btrim(coalesce(v_lead.nome, '')), '') IS NOT NULL
     AND NULLIF(btrim(coalesce(v_lead.cognome, '')), '') IS NOT NULL THEN
    PERFORM public.crea_o_riusa_contatto_in_soggetto(
      _cliente_id := _cliente_id,
      _lead_id := NULL,
      _nome := v_lead.nome,
      _cognome := v_lead.cognome,
      _email := v_lead.email,
      _cellulare := v_lead.cellulare,
      _codice_fiscale := v_lead.codice_fiscale
    );
    v_creati := 1;
  END IF;

  UPDATE public.cantieri SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.opportunita SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.consensi_log SET cliente_id = _cliente_id WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.eventi_partecipanti SET cliente_id = _cliente_id, riconciliato_il = coalesce(riconciliato_il, now()) WHERE lead_id = _lead_id AND cliente_id IS NULL;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, v_lead.stato::text, 'convertito', v_uid, 'Collegato come contatto del cliente ' || v_cliente.ragione_sociale || coalesce(' (' || v_cliente.codice_gestionale || ')', ''));

  UPDATE public.lead SET cliente_id = _cliente_id, convertito_il = now(), convertito_da = v_uid, stato = 'convertito', conversione_tipo = 'contatto_cliente' WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true, 'cliente_id', _cliente_id, 'contatti_spostati', v_spostati, 'contatti_uniti', v_uniti, 'contatti_creati', v_creati);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.collega_lead_a_cliente(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_lead_a_cliente(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.collega_lead_a_cliente(uuid, uuid) IS 'FM38: collega un lead a un cliente esistente come contatto. Il lead resta come storico (stato convertito, conversione_tipo contatto_cliente). Riusa trova_contatto_equivalente e trasferisci_privacy_contatto: non ricopiarne le regole.';

-- 4) annulla_conversione_lead: nuovo ramo per conversione_tipo = ''contatto_cliente''
CREATE OR REPLACE FUNCTION public.annulla_conversione_lead(_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_lead.conversione_tipo = 'contatto_cliente' THEN
    -- Il cliente esisteva già: NON va eliminato. Si scollega soltanto ciò che è ancora legato al lead.
    UPDATE public.contatti SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.cantieri SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.opportunita SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.consensi_log SET cliente_id = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.eventi_partecipanti SET cliente_id = NULL, riconciliato_il = NULL WHERE lead_id = _lead_id AND cliente_id = v_cliente;
    UPDATE public.lead SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'nuovo', conversione_tipo = NULL WHERE id = _lead_id;
    INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
    VALUES (_lead_id, 'convertito', 'nuovo', auth.uid(), 'Collegamento al cliente ' || v_cliente || ' annullato (il cliente non è stato toccato; eventuali contatti già uniti restano nel cliente)');
    RETURN;
  END IF;

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
     SET cliente_id = NULL, convertito_il = NULL, convertito_da = NULL, stato = 'qualificato', conversione_tipo = NULL
   WHERE id = _lead_id;

  DELETE FROM public.clienti WHERE id = v_cliente;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (_lead_id, 'convertito', 'qualificato', auth.uid(), 'Conversione annullata, cliente ' || v_cliente || ' eliminato');
END;
$function$;