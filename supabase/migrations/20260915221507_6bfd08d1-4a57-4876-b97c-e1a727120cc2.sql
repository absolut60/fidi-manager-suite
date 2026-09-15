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

  INSERT INTO public.eventi_partecipanti (evento_id, stato, lead_id, contatto_id, note, registrato_sul_posto)
  VALUES (_evento_id, _stato, v_lead_id, v_contatto_id, nullif(btrim(_note), ''), true)
  RETURNING id INTO v_part_id;

  RETURN QUERY SELECT v_lead_id, v_contatto_id, v_part_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.riconcilia_partecipante(_partecipante_id uuid, _cliente_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  p record;
  l record;
  v_cliente_id uuid;
  v_contatto_id uuid;
  v_contatto_iniziale uuid;
  v_rs text;
  v_piva text;
  v_cf text;
  v_email text;
  v_nome text;
  v_cognome text;
  v_cellulare text;
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_lead_module_access(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO p FROM public.eventi_partecipanti WHERE id = _partecipante_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;
  IF p.cliente_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'gia_riconciliato');
  END IF;

  v_contatto_iniziale := p.contatto_id;

  IF p.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.lead WHERE id = p.lead_id;
  END IF;

  v_rs   := nullif(btrim(coalesce(p.ragione_sociale, l.ragione_sociale)), '');
  v_piva := nullif(btrim(coalesce(p.partita_iva, l.partita_iva)), '');
  v_cf   := nullif(upper(btrim(coalesce(p.codice_fiscale, l.codice_fiscale))), '');
  v_email := nullif(lower(btrim(coalesce(p.email, l.email))), '');
  v_nome := nullif(btrim(coalesce(p.nome, l.nome)), '');
  v_cognome := nullif(btrim(coalesce(p.cognome, l.cognome)), '');
  v_cellulare := nullif(btrim(l.cellulare), '');

  IF v_piva IN ('102730','102729') THEN v_piva := NULL; END IF;
  IF v_cf IN ('102730','102729') THEN v_cf := NULL; END IF;

  IF _cliente_id IS NOT NULL THEN
    PERFORM 1 FROM public.clienti WHERE id = _cliente_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'cliente_non_trovato');
    END IF;
    v_cliente_id := _cliente_id;
  ELSE
    WITH cand AS (
      SELECT DISTINCT c.id
      FROM public.clienti c
      WHERE (v_piva IS NOT NULL AND btrim(c.partita_iva) = v_piva AND btrim(c.partita_iva) NOT IN ('102730','102729'))
         OR (v_cf IS NOT NULL AND upper(btrim(c.codice_fiscale)) = v_cf AND upper(btrim(c.codice_fiscale)) NOT IN ('102730','102729'))
         OR (v_email IS NOT NULL AND lower(btrim(c.email)) = v_email)
         OR (v_rs IS NOT NULL
             AND public.normalizza_ragione_sociale(c.ragione_sociale) IS NOT NULL
             AND public.normalizza_ragione_sociale(c.ragione_sociale) = public.normalizza_ragione_sociale(v_rs))
    )
    SELECT count(*), min(id) INTO v_n, v_cliente_id FROM cand;

    IF coalesce(v_n, 0) <> 1 THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'match_non_univoco', 'n', coalesce(v_n, 0));
    END IF;
  END IF;

  IF (v_nome IS NULL OR v_cognome IS NULL) AND v_contatto_iniziale IS NOT NULL THEN
    SELECT nullif(btrim(coalesce(v_nome, ct.nome)), ''),
           nullif(btrim(coalesce(v_cognome, ct.cognome)), ''),
           coalesce(v_email, nullif(lower(btrim(ct.email)), '')),
           coalesce(v_cellulare, nullif(btrim(ct.cellulare), '')),
           coalesce(v_cf, nullif(upper(btrim(ct.codice_fiscale)), ''))
      INTO v_nome, v_cognome, v_email, v_cellulare, v_cf
    FROM public.contatti ct WHERE ct.id = v_contatto_iniziale;
  END IF;

  v_contatto_id := v_contatto_iniziale;

  IF v_nome IS NOT NULL AND v_cognome IS NOT NULL THEN
    SELECT r.contatto_id INTO v_contatto_id
    FROM public.crea_o_riusa_contatto_in_soggetto(
      _cliente_id := v_cliente_id,
      _lead_id := NULL,
      _nome := v_nome,
      _cognome := v_cognome,
      _email := v_email,
      _cellulare := v_cellulare,
      _codice_fiscale := v_cf
    ) r;
    v_contatto_id := coalesce(v_contatto_id, v_contatto_iniziale);
  END IF;

  IF v_contatto_iniziale IS NOT NULL AND v_contatto_iniziale IS DISTINCT FROM v_contatto_id THEN
    UPDATE public.consensi_log
       SET cliente_id = v_cliente_id,
           lead_id = NULL,
           contatto_id = COALESCE(v_contatto_id, contatto_id)
     WHERE contatto_id = v_contatto_iniziale;
  END IF;

  IF v_contatto_id IS NOT NULL THEN
    BEGIN
      PERFORM public.upsert_iscritto_da_contatto(v_contatto_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  UPDATE public.eventi_partecipanti
     SET cliente_id = v_cliente_id,
         contatto_id = COALESCE(v_contatto_id, contatto_id),
         riconciliato_il = now()
   WHERE id = _partecipante_id;

  RETURN jsonb_build_object('ok', true, 'cliente_id', v_cliente_id, 'contatto_id', v_contatto_id,
                            'modo', CASE WHEN _cliente_id IS NULL THEN 'auto' ELSE 'manuale' END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.riconcilia_partecipante(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_partecipante(uuid, uuid) TO authenticated;