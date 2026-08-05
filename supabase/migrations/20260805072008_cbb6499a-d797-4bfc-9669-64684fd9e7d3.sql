-- a) Collega le righe importate ai soggetti già presenti
CREATE OR REPLACE FUNCTION public.collega_righe_import(_riga_ids uuid[])
RETURNS TABLE(collegate int, saltate int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
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

    INSERT INTO public.eventi_partecipanti (
      evento_id, stato, cliente_id, lead_id, contatto_id, note
    ) VALUES (
      r.evento_id, 'atteso', v_cliente_id, v_lead_id, v_contatto_id, nullif(btrim(r.note), '')
    );

    UPDATE public.eventi_import_righe SET stato = 'collegato' WHERE id = r.id;
    v_collegate := v_collegate + 1;
  END LOOP;

  RETURN QUERY SELECT v_collegate, v_saltate;
END;
$$;

REVOKE ALL ON FUNCTION public.collega_righe_import(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_righe_import(uuid[]) TO authenticated;

-- b) Crea nuovi lead dalle righe importate.
-- Riusa integralmente public.crea_partecipante_da_nuovo_soggetto: viene chiamata
-- in loop, quindi lead + lead_storico + contatto + partecipante restano una sola
-- implementazione (nessuna logica duplicata).
CREATE OR REPLACE FUNCTION public.crea_lead_da_righe_import(_riga_ids uuid[])
RETURNS TABLE(creati int, saltate int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_nome_evento text;
  v_res record;
  v_creati int := 0;
  v_saltate int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  FOR r IN
    SELECT * FROM public.eventi_import_righe
    WHERE id = ANY(_riga_ids)
    ORDER BY riga_numero NULLS LAST
  LOOP
    IF r.stato <> 'in_sospeso' THEN
      v_saltate := v_saltate + 1;
      CONTINUE;
    END IF;

    SELECT e.nome INTO v_nome_evento FROM public.eventi e WHERE e.id = r.evento_id;

    SELECT * INTO v_res FROM public.crea_partecipante_da_nuovo_soggetto(
      _evento_id := r.evento_id,
      _stato := 'atteso'::eventi_partecipante_stato,
      _tipo_soggetto := CASE WHEN nullif(btrim(coalesce(r.ragione_sociale,'')), '') IS NOT NULL
                             THEN 'azienda' ELSE 'persona_fisica' END,
      _ragione_sociale := r.ragione_sociale,
      _nome := r.nome,
      _cognome := r.cognome,
      _partita_iva := r.partita_iva,
      _codice_fiscale := r.codice_fiscale,
      _email := r.email,
      _telefono := r.telefono,
      _cellulare := r.cellulare,
      _note := r.note,
      _fonte_dettaglio := v_nome_evento,
      _crea_contatto := nullif(btrim(coalesce(r.nome,'')), '') IS NOT NULL
    );

    UPDATE public.eventi_import_righe
    SET stato = 'lead_creato',
        match_tipo = 'lead',
        match_id = v_res.lead_id,
        match_contatto_id = v_res.contatto_id
    WHERE id = r.id;

    v_creati := v_creati + 1;
  END LOOP;

  RETURN QUERY SELECT v_creati, v_saltate;
END;
$$;

REVOKE ALL ON FUNCTION public.crea_lead_da_righe_import(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crea_lead_da_righe_import(uuid[]) TO authenticated;

-- c) Scarta le righe selezionate
CREATE OR REPLACE FUNCTION public.scarta_righe_import(_riga_ids uuid[])
RETURNS TABLE(scartate int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  UPDATE public.eventi_import_righe
  SET stato = 'scartato'
  WHERE id = ANY(_riga_ids) AND stato = 'in_sospeso';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN QUERY SELECT v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.scarta_righe_import(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scarta_righe_import(uuid[]) TO authenticated;