CREATE OR REPLACE FUNCTION public.collega_righe_import(_riga_ids uuid[])
 RETURNS TABLE(collegate integer, saltate integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_cliente_id uuid;
  v_lead_id uuid;
  v_contatto_id uuid;
  v_collegate int := 0;
  v_saltate int := 0;
  v_esiste boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_eventi_flusso_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  FOR r IN
    SELECT * FROM public.eventi_import_righe
    WHERE id = ANY(_riga_ids)
    ORDER BY riga_numero NULLS LAST
  LOOP
    -- righe già lavorate o senza corrispondenza utilizzabile
    IF r.stato <> 'in_sospeso'
       OR r.match_tipo IS NULL
       OR r.match_tipo NOT IN ('cliente','lead','contatto')
       OR r.match_id IS NULL THEN
      v_saltate := v_saltate + 1;
      CONTINUE;
    END IF;

    v_cliente_id := NULL;
    v_lead_id := NULL;
    v_contatto_id := r.match_contatto_id;

    IF r.match_tipo = 'cliente' THEN
      v_cliente_id := r.match_id;
    ELSIF r.match_tipo = 'lead' THEN
      v_lead_id := r.match_id;
    ELSE
      -- match su contatto: il soggetto è il cliente o il lead a cui è collegato
      SELECT c.cliente_id, c.lead_id INTO v_cliente_id, v_lead_id
      FROM public.contatti c WHERE c.id = coalesce(r.match_contatto_id, r.match_id);
      IF v_cliente_id IS NULL AND v_lead_id IS NULL THEN
        SELECT cl.id INTO v_cliente_id FROM public.clienti cl WHERE cl.id = r.match_id;
        IF v_cliente_id IS NULL THEN
          SELECT l.id INTO v_lead_id FROM public.lead l WHERE l.id = r.match_id;
        END IF;
      END IF;
    END IF;

    IF v_cliente_id IS NULL AND v_lead_id IS NULL THEN
      v_saltate := v_saltate + 1;
      CONTINUE;
    END IF;

    -- nessun doppione sullo stesso evento
    SELECT EXISTS (
      SELECT 1 FROM public.eventi_partecipanti p
      WHERE p.evento_id = r.evento_id
        AND ((v_cliente_id IS NOT NULL AND p.cliente_id = v_cliente_id)
          OR (v_lead_id IS NOT NULL AND p.lead_id = v_lead_id))
    ) INTO v_esiste;

    IF v_esiste THEN
      v_saltate := v_saltate + 1;
      CONTINUE;
    END IF;

    -- contatto della persona importata nel soggetto collegato (non fatale)
    IF v_contatto_id IS NULL AND nullif(btrim(coalesce(r.nome,'')), '') IS NOT NULL THEN
      BEGIN
        SELECT x.contatto_id INTO v_contatto_id
        FROM public.crea_o_riusa_contatto_in_soggetto(
          _cliente_id := v_cliente_id,
          _lead_id := v_lead_id,
          _nome := r.nome,
          _cognome := r.cognome,
          _email := r.email,
          _cellulare := r.cellulare,
          _codice_fiscale := r.codice_fiscale
        ) x;
      EXCEPTION WHEN OTHERS THEN
        v_contatto_id := NULL;
      END;
    END IF;

    INSERT INTO public.eventi_partecipanti (
      evento_id, stato, cliente_id, lead_id, contatto_id, note, origine,
      nome, cognome, ragione_sociale, partita_iva, codice_fiscale, email, telefono
    ) VALUES (
      r.evento_id, 'atteso', v_cliente_id, v_lead_id, v_contatto_id, nullif(btrim(r.note), ''), 'import',
      nullif(btrim(r.nome), ''), nullif(btrim(r.cognome), ''), nullif(btrim(r.ragione_sociale), ''),
      nullif(btrim(r.partita_iva), ''), nullif(btrim(r.codice_fiscale), ''), nullif(btrim(r.email), ''),
      nullif(btrim(r.telefono), '')
    );

    -- privacy "firmata da azienda del gruppo": solo trattamento base, non fatale
    IF v_contatto_id IS NOT NULL THEN
      BEGIN
        PERFORM public.registra_consensi_batch(
          _contatto_id := v_contatto_id,
          _marketing_diretto := false,
          _marketing_media := false,
          _profilazione := false,
          _origine := 'azienda_gruppo',
          _operatore_id := v_uid,
          _note := 'Privacy raccolta da azienda del gruppo'
        );
        UPDATE public.contatti
           SET privacy_firmata = true, data_firma = coalesce(data_firma, now())
         WHERE id = v_contatto_id AND privacy_firmata IS DISTINCT FROM true;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    UPDATE public.eventi_import_righe SET stato = 'collegato' WHERE id = r.id;
    v_collegate := v_collegate + 1;
  END LOOP;

  RETURN QUERY SELECT v_collegate, v_saltate;
END;
$function$;