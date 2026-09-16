CREATE OR REPLACE FUNCTION public.crea_lead_da_partecipante(_partecipante_id uuid, _fonte_dettaglio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  p public.eventi_partecipanti%ROWTYPE;
  v_azienda boolean;
  v_tipo text;
  v_lead_id uuid;
  v_contatto_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti WHERE id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  IF p.cliente_id IS NOT NULL OR p.lead_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'gia_riconciliato');
  END IF;

  v_azienda := (nullif(btrim(p.ragione_sociale), '') IS NOT NULL);
  v_tipo := CASE WHEN v_azienda THEN 'azienda' ELSE 'persona_fisica' END;

  INSERT INTO public.lead (
    tipo_soggetto, ragione_sociale, nome, cognome, partita_iva, codice_fiscale,
    email, telefono, fonte, fonte_dettaglio, tipo_lead, priorita, stato, created_by
  ) VALUES (
    v_tipo,
    CASE WHEN v_azienda THEN nullif(btrim(p.ragione_sociale), '') ELSE NULL END,
    nullif(btrim(p.nome), ''),
    nullif(btrim(p.cognome), ''),
    nullif(btrim(p.partita_iva), ''),
    nullif(upper(btrim(p.codice_fiscale)), ''),
    nullif(lower(btrim(p.email)), ''),
    nullif(btrim(p.telefono), ''),
    'evento',
    nullif(btrim(_fonte_dettaglio), ''),
    'potenziale_cliente',
    'media',
    'nuovo',
    v_uid
  ) RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (v_lead_id, NULL, 'nuovo', v_uid, 'Lead creato dalla riconciliazione evento');

  IF p.contatto_id IS NOT NULL THEN
    UPDATE public.contatti SET lead_id = v_lead_id WHERE id = p.contatto_id;
    v_contatto_id := p.contatto_id;
  ELSIF nullif(btrim(p.nome), '') IS NOT NULL THEN
    INSERT INTO public.contatti (lead_id, cliente_id, nome, cognome, email, telefono, codice_fiscale, ruolo, principale)
    VALUES (
      v_lead_id,
      NULL,
      nullif(btrim(p.nome), ''),
      nullif(btrim(p.cognome), ''),
      nullif(btrim(p.email), ''),
      nullif(btrim(p.telefono), ''),
      nullif(btrim(p.codice_fiscale), ''),
      CASE WHEN v_azienda THEN 'Referente' ELSE NULL END,
      false
    ) RETURNING id INTO v_contatto_id;
  END IF;

  IF v_contatto_id IS NOT NULL THEN
    UPDATE public.consensi_log
    SET lead_id = v_lead_id
    WHERE contatto_id = v_contatto_id
      AND cliente_id IS NULL
      AND lead_id IS NULL;
  END IF;

  UPDATE public.eventi_partecipanti
  SET lead_id = v_lead_id,
      contatto_id = COALESCE(v_contatto_id, contatto_id),
      riconciliato_il = now()
  WHERE id = _partecipante_id;

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'contatto_id', v_contatto_id);
END;
$function$;