CREATE OR REPLACE FUNCTION public.classifica_iscritto_whatsapp(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_cand jsonb;
  v_dec jsonb;
  v_dec_id uuid;
  v_cand_cli jsonb;
  v_cand_lead jsonb;
  v_n_cli int;
  v_esito text;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  -- Motore unico di riconciliazione (stesso degli eventi)
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', cc.tipo, 'id', cc.id, 'etichetta', cc.etichetta, 'forte', cc.forte, 'motivi', to_jsonb(cc.motivi))), '[]'::jsonb)
    INTO v_cand
  FROM public.cerca_candidati_per_dati(
    _ragione_sociale := v_isc.azienda,
    _partita_iva := NULL,
    _codice_fiscale := NULL,
    _email := v_isc.email,
    _cellulare := v_isc.numero_norm,
    _escludi_lead_id := NULL
  ) cc;

  v_dec := public.decidi_candidato_riconciliazione(v_cand, v_isc.azienda);
  v_dec_id := CASE WHEN (v_dec->>'ok')::boolean IS TRUE THEN (v_dec->>'id')::uuid END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', (e->>'id')::uuid,
           'ragione_sociale', e->>'etichetta',
           'motivi', (SELECT string_agg(m, ', ') FROM jsonb_array_elements_text(e->'motivi') m))
           ORDER BY ((e->>'id')::uuid IS NOT DISTINCT FROM v_dec_id) DESC, e->>'etichetta'), '[]'::jsonb),
         count(*)
    INTO v_cand_cli, v_n_cli
  FROM jsonb_array_elements(v_cand) e WHERE e->>'tipo' = 'cliente';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', (e->>'id')::uuid,
           'nominativo', e->>'etichetta',
           'motivi', (SELECT string_agg(m, ', ') FROM jsonb_array_elements_text(e->'motivi') m))
           ORDER BY ((e->>'id')::uuid IS NOT DISTINCT FROM v_dec_id) DESC, e->>'etichetta'), '[]'::jsonb)
    INTO v_cand_lead
  FROM jsonb_array_elements(v_cand) e WHERE e->>'tipo' = 'lead';

  v_esito := CASE
    WHEN (v_dec->>'ok')::boolean IS TRUE THEN 'collega_auto'
    WHEN jsonb_array_length(v_cand) > 0 THEN 'ambiguo'
    ELSE 'nuovo' END;

  RETURN jsonb_build_object(
    'ok', true,
    'iscritto_id', _id,
    'numero', v_isc.numero_norm,
    'impresa_norm', NULLIF(public.normalizza_ragione_sociale(coalesce(v_isc.azienda,'')), ''),
    'esito', v_esito,
    'n_clienti_candidati', v_n_cli,
    'candidati_clienti', v_cand_cli,
    'candidati_lead', v_cand_lead,
    'decisione', v_dec
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._crea_contatto_lead_da_iscritto(_isc_id uuid, _lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_contatto_id uuid;
  v_mkt boolean;
  v_prof boolean;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _isc_id;
  IF NOT FOUND OR _lead_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_contatto_id
  FROM public.contatti
  WHERE lead_id = _lead_id
    AND public.normalizza_numero_it(cellulare) = v_isc.numero_norm
  LIMIT 1;

  IF v_contatto_id IS NOT NULL THEN
    UPDATE public.contatti
    SET whatsapp_opt_in = true,
        email = COALESCE(email, NULLIF(btrim(v_isc.email), '')),
        cellulare = COALESCE(cellulare, v_isc.numero_norm),
        updated_at = now()
    WHERE id = v_contatto_id;
  ELSE
    INSERT INTO public.contatti(
      cliente_id, lead_id, nome, cognome, ruolo, cellulare, email, whatsapp_opt_in, principale
    ) VALUES (
      NULL, _lead_id,
      COALESCE(NULLIF(btrim(v_isc.nome),''), 'Contatto'),
      NULLIF(btrim(v_isc.cognome),''),
      'Contatto WhatsApp',
      v_isc.numero_norm,
      NULLIF(btrim(coalesce(v_isc.email,'')), ''),
      true,
      NOT EXISTS (SELECT 1 FROM public.contatti c WHERE c.lead_id = _lead_id AND c.principale IS TRUE)
    ) RETURNING id INTO v_contatto_id;
  END IF;

  SELECT valore INTO v_mkt FROM public.consensi_log
   WHERE iscritto_id = _isc_id AND tipo_consenso = 'marketing_diretto'
   ORDER BY created_at DESC LIMIT 1;
  SELECT valore INTO v_prof FROM public.consensi_log
   WHERE iscritto_id = _isc_id AND tipo_consenso = 'profilazione'
   ORDER BY created_at DESC LIMIT 1;
  IF v_mkt IS TRUE THEN
    UPDATE public.contatti SET consenso_marketing_diretto = true
     WHERE id = v_contatto_id AND consenso_marketing_diretto IS DISTINCT FROM true;
  END IF;
  IF v_prof IS TRUE THEN
    UPDATE public.contatti SET consenso_profilazione = true
     WHERE id = v_contatto_id AND consenso_profilazione IS DISTINCT FROM true;
  END IF;

  RETURN v_contatto_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._crea_contatto_lead_da_iscritto(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crea_contatto_lead_da_iscritto(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.crea_lead_da_iscritto(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_lead_id uuid;
  v_log_id uuid;
  v_contatto_id uuid;
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  IF v_isc.lead_id IS NOT NULL OR v_isc.cliente_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'gia_collegato');
  END IF;

  INSERT INTO public.lead(ragione_sociale, nome, cognome, cellulare, email, fonte, fonte_dettaglio, note)
  VALUES (
    NULLIF(btrim(coalesce(v_isc.azienda,'')), ''),
    NULLIF(btrim(v_isc.nome), ''),
    NULLIF(btrim(v_isc.cognome), ''),
    v_isc.numero_norm,
    NULLIF(btrim(coalesce(v_isc.email,'')), ''),
    'web',
    'Iscrizione WhatsApp',
    'Creato da iscritto WhatsApp (' || coalesce(v_isc.origine,'link') || ')'
  ) RETURNING id INTO v_lead_id;

  v_contatto_id := public._crea_contatto_lead_da_iscritto(_id, v_lead_id);

  IF EXISTS (SELECT 1 FROM public.consensi_log WHERE iscritto_id = _id) THEN
    UPDATE public.consensi_log
       SET lead_id = v_lead_id, contatto_id = v_contatto_id
     WHERE iscritto_id = _id;
    SELECT id INTO v_log_id FROM public.consensi_log
     WHERE iscritto_id = _id AND tipo_consenso = 'whatsapp'
     ORDER BY created_at ASC LIMIT 1;
  ELSE
    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    )
    SELECT v_contatto_id, NULL, v_lead_id, 'whatsapp', true, 'link_pubblico',
      cl.ip_address, cl.user_agent, cl.informativa_versione, cl.informativa_hash, cl.secondi_permanenza,
      'Creazione lead da iscritto WhatsApp'
    FROM (SELECT ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza
          FROM public.consensi_log WHERE id = v_isc.consenso_log_id) cl
    RETURNING id INTO v_log_id;

    IF v_log_id IS NULL THEN
      INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
      VALUES (v_contatto_id, NULL, v_lead_id, 'whatsapp', true, 'link_pubblico',
        'Creazione lead da iscritto WhatsApp (iscritto puro)')
      RETURNING id INTO v_log_id;
    END IF;
  END IF;

  UPDATE public.iscritti_whatsapp
  SET lead_id = v_lead_id,
      contatto_id = v_contatto_id,
      consenso_log_id = COALESCE(v_log_id, consenso_log_id),
      stato = 'collegato_lead'
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'log_id', v_log_id, 'contatto_id', v_contatto_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_collega_iscritto_whatsapp(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cls jsonb;
  v_dec jsonb;
  v_tipo text;
  v_dest uuid;
  v_log_id uuid;
  v_contatto_id uuid;
BEGIN
  v_cls := public.classifica_iscritto_whatsapp(_id);
  v_dec := v_cls->'decisione';
  IF v_dec IS NULL OR (v_dec->>'ok')::boolean IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  v_tipo := v_dec->>'tipo';
  v_dest := (v_dec->>'id')::uuid;
  IF v_dest IS NULL THEN RETURN NULL; END IF;

  IF v_tipo = 'cliente' THEN
    v_contatto_id := public._crea_contatto_da_iscritto(_id, v_dest);

    IF EXISTS (SELECT 1 FROM public.consensi_log WHERE iscritto_id = _id) THEN
      UPDATE public.consensi_log
      SET contatto_id = COALESCE(v_contatto_id, contatto_id),
          cliente_id  = COALESCE(v_dest, cliente_id)
      WHERE iscritto_id = _id;

      SELECT id INTO v_log_id
      FROM public.consensi_log
      WHERE iscritto_id = _id AND tipo_consenso = 'whatsapp'
      ORDER BY created_at
      LIMIT 1;
    ELSE
      INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
      VALUES (v_contatto_id, v_dest, NULL, 'whatsapp', true, 'link_pubblico',
        'Collegamento automatico iscritto WhatsApp (iscritto puro, prova non salvata)')
      RETURNING id INTO v_log_id;
    END IF;

    UPDATE public.iscritti_whatsapp
    SET cliente_id = v_dest,
        contatto_id = COALESCE(v_contatto_id, contatto_id),
        consenso_log_id = COALESCE(v_log_id, consenso_log_id),
        stato = 'collegato_cliente'
    WHERE id = _id;

    RETURN v_dest;
  ELSIF v_tipo = 'lead' THEN
    v_contatto_id := public._crea_contatto_lead_da_iscritto(_id, v_dest);

    UPDATE public.consensi_log
    SET lead_id = v_dest,
        contatto_id = COALESCE(v_contatto_id, contatto_id)
    WHERE iscritto_id = _id;

    SELECT id INTO v_log_id
    FROM public.consensi_log
    WHERE iscritto_id = _id AND tipo_consenso = 'whatsapp'
    ORDER BY created_at
    LIMIT 1;

    UPDATE public.iscritti_whatsapp
    SET lead_id = v_dest,
        contatto_id = COALESCE(v_contatto_id, contatto_id),
        consenso_log_id = COALESCE(v_log_id, consenso_log_id),
        stato = 'collegato_lead'
    WHERE id = _id;

    RETURN v_dest;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(_numero_raw text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _email text DEFAULT NULL::text, _origine text DEFAULT 'link'::text, _ip text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _informativa_versione text DEFAULT NULL::text, _informativa_hash text DEFAULT NULL::text, _secondi_permanenza integer DEFAULT NULL::integer, _azienda text DEFAULT NULL::text, _consenso_marketing boolean DEFAULT false, _consenso_profilazione boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_log_id uuid; v_optional_log_id uuid; v_log_ids uuid[] := ARRAY[]::uuid[];
  v_origine_log text;
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_isc_id uuid; v_contatto_id uuid;
BEGIN
  v_norm := public.normalizza_numero_it(_numero_raw);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'numero_non_valido');
  END IF;

  v_origine_log := CASE
    WHEN _origine = 'operatore' THEN 'operatore'
    WHEN _origine = 'qr_pagina' THEN 'qr_whatsapp'
    ELSE 'link_pubblico'
  END;

  -- 1) Riga iscritto (upsert). Il collegamento lo decide solo auto_collega_iscritto_whatsapp.
  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, azienda, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _azienda, _origine, 'nuovo', NULL, NULL, NULL
  )
  ON CONFLICT (numero_norm) WHERE (stato <> 'ignorato')
  DO UPDATE SET
    numero_raw = EXCLUDED.numero_raw,
    nome = COALESCE(NULLIF(btrim(EXCLUDED.nome),''), public.iscritti_whatsapp.nome),
    cognome = COALESCE(NULLIF(btrim(EXCLUDED.cognome),''), public.iscritti_whatsapp.cognome),
    email = COALESCE(NULLIF(btrim(EXCLUDED.email),''), public.iscritti_whatsapp.email),
    azienda = COALESCE(NULLIF(btrim(EXCLUDED.azienda),''), public.iscritti_whatsapp.azienda),
    stato = CASE
      WHEN public.iscritti_whatsapp.cliente_id IS NOT NULL OR public.iscritti_whatsapp.lead_id IS NOT NULL
        THEN public.iscritti_whatsapp.stato
      ELSE EXCLUDED.stato END
  RETURNING * INTO v_isc;
  v_isc_id := v_isc.id;

  -- 2) Prove GDPR SEMPRE (collegate all'iscritto; cliente/lead/contatto se già collegato)
  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    v_isc.contatto_id, v_isc.cliente_id, v_isc.lead_id, v_isc_id, 'whatsapp', true, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_log_id;
  v_log_ids := array_append(v_log_ids, v_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    v_isc.contatto_id, v_isc.cliente_id, v_isc.lead_id, v_isc_id, 'trattamento_dati', true, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    v_isc.contatto_id, v_isc.cliente_id, v_isc.lead_id, v_isc_id, 'marketing_diretto', _consenso_marketing, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    v_isc.contatto_id, v_isc.cliente_id, v_isc.lead_id, v_isc_id, 'profilazione', _consenso_profilazione, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  -- 3) Aggancio della prova whatsapp all'iscritto
  UPDATE public.iscritti_whatsapp
  SET consenso_log_id = COALESCE(v_log_id, consenso_log_id)
  WHERE id = v_isc_id;

  IF v_isc.cliente_id IS NOT NULL OR v_isc.lead_id IS NOT NULL THEN
    -- Già collegato: allinea il contatto esistente (consensi solo verso true)
    v_contatto_id := v_isc.contatto_id;
    IF v_contatto_id IS NULL THEN
      IF v_isc.cliente_id IS NOT NULL THEN
        v_contatto_id := public._crea_contatto_da_iscritto(v_isc_id, v_isc.cliente_id);
      ELSE
        v_contatto_id := public._crea_contatto_lead_da_iscritto(v_isc_id, v_isc.lead_id);
      END IF;
    END IF;
    IF v_contatto_id IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_contatto_id WHERE id = v_isc_id;
      UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = ANY(v_log_ids);
      UPDATE public.contatti SET
        whatsapp_opt_in = true,
        consenso_marketing_diretto = CASE WHEN _consenso_marketing THEN true ELSE consenso_marketing_diretto END,
        consenso_profilazione      = CASE WHEN _consenso_profilazione THEN true ELSE consenso_profilazione END,
        updated_at = now()
      WHERE id = v_contatto_id;
    END IF;
  ELSE
    PERFORM public.auto_collega_iscritto_whatsapp(v_isc_id);
  END IF;

  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = v_isc_id;

  RETURN jsonb_build_object('ok', true,
    'esito', CASE WHEN v_isc.cliente_id IS NOT NULL OR v_isc.lead_id IS NOT NULL THEN 'collegato' ELSE 'in_lista' END,
    'stato', v_isc.stato,
    'numero', v_norm);
END;
$function$;