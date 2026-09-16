CREATE OR REPLACE FUNCTION public.crea_lead_da_righe_import(_riga_ids uuid[])
 RETURNS TABLE(creati integer, saltate integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    UPDATE public.eventi_partecipanti
       SET origine = 'import', registrato_sul_posto = false
     WHERE id = v_res.partecipante_id;

    -- privacy "firmata da azienda del gruppo": solo trattamento base, non fatale
    IF v_res.contatto_id IS NOT NULL THEN
      BEGIN
        PERFORM public.registra_consensi_batch(
          _contatto_id := v_res.contatto_id,
          _marketing_diretto := false,
          _marketing_media := false,
          _profilazione := false,
          _origine := 'azienda_gruppo',
          _operatore_id := v_uid,
          _note := 'Privacy raccolta da azienda del gruppo'
        );
        UPDATE public.contatti
           SET privacy_firmata = true, data_firma = coalesce(data_firma, now())
         WHERE id = v_res.contatto_id AND privacy_firmata IS DISTINCT FROM true;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

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
$function$