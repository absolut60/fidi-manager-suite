CREATE OR REPLACE FUNCTION public.crea_partecipante_da_nuovo_soggetto(_evento_id uuid, _stato eventi_partecipante_stato, _tipo_soggetto text, _ragione_sociale text DEFAULT NULL::text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _partita_iva text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text, _email text DEFAULT NULL::text, _telefono text DEFAULT NULL::text, _cellulare text DEFAULT NULL::text, _indirizzo text DEFAULT NULL::text, _citta text DEFAULT NULL::text, _cap text DEFAULT NULL::text, _provincia text DEFAULT NULL::text, _note text DEFAULT NULL::text, _fonte_dettaglio text DEFAULT NULL::text, _crea_contatto boolean DEFAULT false)
RETURNS TABLE(lead_id uuid, contatto_id uuid, partecipante_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lead_id uuid := NULL;
  v_contatto_id uuid := NULL;
  v_part_id uuid;
  v_azienda boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  IF _tipo_soggetto NOT IN ('azienda','persona_fisica') THEN
    RAISE EXCEPTION 'Tipo soggetto non valido';
  END IF;
  v_azienda := (_tipo_soggetto = 'azienda');

  -- Nessuna creazione lead/storico: il walk-in vive solo su eventi_partecipanti.

  IF _crea_contatto AND nullif(btrim(_nome), '') IS NOT NULL THEN
    INSERT INTO public.contatti (
      lead_id, cliente_id, nome, cognome, email, telefono, cellulare, codice_fiscale, ruolo, principale
    ) VALUES (
      NULL, NULL,
      btrim(_nome),
      nullif(btrim(_cognome), ''),
      nullif(btrim(_email), ''),
      nullif(btrim(_telefono), ''),
      nullif(btrim(_cellulare), ''),
      nullif(upper(btrim(_codice_fiscale)), ''),
      CASE WHEN v_azienda THEN 'Referente' ELSE NULL END,
      false
    )
    RETURNING id INTO v_contatto_id;
  END IF;

  INSERT INTO public.eventi_partecipanti (
    evento_id, stato, lead_id, cliente_id, contatto_id,
    nome, cognome, ragione_sociale, partita_iva, codice_fiscale, email, telefono, note,
    registrato_sul_posto
  ) VALUES (
    _evento_id, _stato, NULL, NULL, v_contatto_id,
    nullif(btrim(_nome), ''),
    nullif(btrim(_cognome), ''),
    CASE WHEN v_azienda THEN nullif(btrim(_ragione_sociale), '') ELSE NULL END,
    nullif(btrim(_partita_iva), ''),
    nullif(btrim(_codice_fiscale), ''),
    nullif(btrim(_email), ''),
    nullif(btrim(_telefono), ''),
    nullif(btrim(_note), ''),
    true
  )
  RETURNING id INTO v_part_id;

  RETURN QUERY SELECT v_lead_id, v_contatto_id, v_part_id;
END;
$function$;