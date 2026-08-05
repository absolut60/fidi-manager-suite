CREATE OR REPLACE FUNCTION public.get_utenti_assegnabili()
 RETURNS TABLE(id uuid, nome text, cognome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_lead_module_access(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.nome, p.cognome
    FROM public.profili p
    WHERE p.attivo = true
    ORDER BY p.cognome, p.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crea_partecipante_da_nuovo_soggetto(_evento_id uuid, _stato eventi_partecipante_stato, _tipo_soggetto text, _ragione_sociale text DEFAULT NULL::text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _partita_iva text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text, _email text DEFAULT NULL::text, _telefono text DEFAULT NULL::text, _cellulare text DEFAULT NULL::text, _indirizzo text DEFAULT NULL::text, _citta text DEFAULT NULL::text, _cap text DEFAULT NULL::text, _provincia text DEFAULT NULL::text, _note text DEFAULT NULL::text, _fonte_dettaglio text DEFAULT NULL::text, _crea_contatto boolean DEFAULT false)
 RETURNS TABLE(lead_id uuid, contatto_id uuid, partecipante_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_contatto_id uuid;
  v_part_id uuid;
  v_uid uuid := auth.uid();
  v_azienda boolean := (_tipo_soggetto = 'azienda');
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  IF _tipo_soggetto NOT IN ('azienda','persona_fisica') THEN
    RAISE EXCEPTION 'Tipo soggetto non valido';
  END IF;

  INSERT INTO public.lead (
    tipo_soggetto, ragione_sociale, nome, cognome, partita_iva, codice_fiscale,
    email, telefono, cellulare, indirizzo, citta, cap, provincia,
    fonte, fonte_dettaglio, tipo_lead, priorita, stato, note, created_by
  ) VALUES (
    _tipo_soggetto,
    CASE WHEN v_azienda THEN nullif(btrim(_ragione_sociale), '') ELSE NULL END,
    nullif(btrim(_nome), ''),
    nullif(btrim(_cognome), ''),
    nullif(btrim(_partita_iva), ''),
    nullif(btrim(_codice_fiscale), ''),
    nullif(btrim(_email), ''),
    nullif(btrim(_telefono), ''),
    nullif(btrim(_cellulare), ''),
    nullif(btrim(_indirizzo), ''),
    nullif(btrim(_citta), ''),
    nullif(btrim(_cap), ''),
    nullif(btrim(_provincia), ''),
    'evento', nullif(btrim(_fonte_dettaglio), ''),
    'potenziale_cliente', 'media', 'nuovo',
    nullif(btrim(_note), ''), v_uid
  ) RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (v_lead_id, NULL, 'nuovo', v_uid,
          'Lead creato dall''evento: ' || coalesce(_fonte_dettaglio, ''));

  IF _crea_contatto AND nullif(btrim(_nome), '') IS NOT NULL THEN
    INSERT INTO public.contatti (
      lead_id, cliente_id, nome, cognome, email, telefono, cellulare, codice_fiscale, ruolo
    ) VALUES (
      v_lead_id, NULL,
      btrim(_nome),
      nullif(btrim(_cognome), ''),
      nullif(btrim(_email), ''),
      nullif(btrim(_telefono), ''),
      nullif(btrim(_cellulare), ''),
      nullif(btrim(_codice_fiscale), ''),
      CASE WHEN v_azienda THEN 'Referente' ELSE NULL END
    ) RETURNING id INTO v_contatto_id;
  END IF;

  INSERT INTO public.eventi_partecipanti (evento_id, stato, lead_id, contatto_id, note)
  VALUES (_evento_id, _stato, v_lead_id, v_contatto_id, nullif(btrim(_note), ''))
  RETURNING id INTO v_part_id;

  RETURN QUERY SELECT v_lead_id, v_contatto_id, v_part_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.elimina_lead(_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cliente_id uuid;
  _found boolean;
BEGIN
  IF NOT public.has_lead_module_access(auth.uid()) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  SELECT true, l.cliente_id INTO _found, _cliente_id
  FROM public.lead l WHERE l.id = _lead_id;

  IF NOT COALESCE(_found, false) THEN
    RAISE EXCEPTION 'Lead inesistente';
  END IF;

  IF _cliente_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead convertito in cliente: annulla prima la conversione oppure elimina il cliente.';
  END IF;

  DELETE FROM public.contatti WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.contatti SET lead_id = NULL WHERE lead_id = _lead_id;

  DELETE FROM public.cantieri WHERE lead_id = _lead_id AND cliente_id IS NULL;
  UPDATE public.cantieri SET lead_id = NULL WHERE lead_id = _lead_id;

  DELETE FROM public.lead WHERE id = _lead_id;
END;
$function$;