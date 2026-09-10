CREATE OR REPLACE FUNCTION public.get_whatsapp_cliente(_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_numero text;
  v_opt_in boolean;
  v_aggiornato timestamptz;
  v_store_id uuid;
  v_codice_agente text;
BEGIN
  SELECT store_id, codice_agente
    INTO v_store_id, v_codice_agente
  FROM public.clienti
  WHERE id = _cliente_id;

  IF NOT (
    public.auth_ha_ruolo_globale_clienti()
    OR public.user_can_access_cliente(_cliente_id, v_store_id, v_codice_agente)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT cellulare INTO v_numero FROM public.clienti WHERE id = _cliente_id;

  SELECT opt_in, aggiornato_at
    INTO v_opt_in, v_aggiornato
  FROM public.v_whatsapp_opt_in_attuale
  WHERE cliente_id = _cliente_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'numero', v_numero,
    'opt_in', COALESCE(v_opt_in, false),
    'ha_consenso', (v_opt_in IS TRUE),
    'aggiornato_at', v_aggiornato
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._crea_contatto_da_iscritto(_isc_id uuid, _cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_contatto_id uuid;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _isc_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_contatto_id
  FROM public.contatti
  WHERE cliente_id = _cliente_id
    AND public.normalizza_numero_it(cellulare) = v_isc.numero_norm
  LIMIT 1;

  IF v_contatto_id IS NOT NULL THEN
    UPDATE public.contatti
    SET whatsapp_opt_in = true,
        updated_at = now()
    WHERE id = v_contatto_id;
    RETURN v_contatto_id;
  END IF;

  INSERT INTO public.contatti(
    cliente_id, nome, cognome, ruolo, cellulare, whatsapp_opt_in, principale
  ) VALUES (
    _cliente_id,
    COALESCE(NULLIF(btrim(v_isc.nome),''), 'Contatto'),
    NULLIF(btrim(v_isc.cognome),''),
    'Contatto WhatsApp',
    v_isc.numero_norm,
    true,
    false
  ) RETURNING id INTO v_contatto_id;

  RETURN v_contatto_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(_numero_raw text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _email text DEFAULT NULL::text, _origine text DEFAULT 'link'::text, _ip text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _informativa_versione text DEFAULT NULL::text, _informativa_hash text DEFAULT NULL::text, _secondi_permanenza integer DEFAULT NULL::integer, _azienda text DEFAULT NULL::text, _consenso_marketing boolean DEFAULT false, _consenso_profilazione boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text; v_cli_cnt int; v_cli uuid; v_lead_cnt int; v_lead uuid;
  v_log_id uuid; v_optional_log_id uuid; v_log_ids uuid[] := ARRAY[]::uuid[];
  v_stato text; v_esito text; v_origine_log text;
  v_isc_id uuid; v_contatto_id uuid;
BEGIN
  v_norm := public.normalizza_numero_it(_numero_raw);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'numero_non_valido');
  END IF;

  v_origine_log := CASE WHEN _origine = 'operatore' THEN 'operatore' ELSE 'link_pubblico' END;

  SELECT count(*) INTO v_cli_cnt
  FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = v_norm;
  IF v_cli_cnt = 1 THEN
    SELECT id INTO v_cli FROM public.clienti
    WHERE public.normalizza_numero_it(cellulare) = v_norm LIMIT 1;
  END IF;

  IF v_cli IS NULL THEN
    SELECT count(*) INTO v_lead_cnt
    FROM public.lead WHERE public.normalizza_numero_it(cellulare) = v_norm;
    IF v_lead_cnt = 1 THEN
      SELECT id INTO v_lead FROM public.lead
      WHERE public.normalizza_numero_it(cellulare) = v_norm LIMIT 1;
    END IF;
  END IF;

  IF v_cli IS NOT NULL OR v_lead IS NOT NULL THEN
    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'whatsapp', true, v_origine_log,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
      'Iscrizione WhatsApp (' || _origine || ')'
    ) RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);

    IF _consenso_marketing THEN
      INSERT INTO public.consensi_log(
        contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
        ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
      ) VALUES (
        NULL, v_cli, v_lead, 'marketing_diretto', true, v_origine_log,
        _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
        'Iscrizione WhatsApp (' || _origine || ')'
      ) RETURNING id INTO v_optional_log_id;
      v_log_ids := array_append(v_log_ids, v_optional_log_id);
    END IF;

    IF _consenso_profilazione THEN
      INSERT INTO public.consensi_log(
        contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
        ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
      ) VALUES (
        NULL, v_cli, v_lead, 'profilazione', true, v_origine_log,
        _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
        'Iscrizione WhatsApp (' || _origine || ')'
      ) RETURNING id INTO v_optional_log_id;
      v_log_ids := array_append(v_log_ids, v_optional_log_id);
    END IF;
  END IF;

  v_stato := CASE
    WHEN v_cli IS NOT NULL THEN 'collegato_cliente'
    WHEN v_lead IS NOT NULL THEN 'collegato_lead'
    ELSE 'nuovo' END;
  v_esito := CASE WHEN v_cli IS NOT NULL OR v_lead IS NOT NULL THEN 'collegato' ELSE 'in_lista' END;

  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, azienda, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _azienda, _origine, v_stato, v_cli, v_lead, v_log_id
  ) RETURNING id INTO v_isc_id;

  IF v_cli IS NOT NULL THEN
    v_contatto_id := public._crea_contatto_da_iscritto(v_isc_id, v_cli);
    IF v_contatto_id IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_contatto_id WHERE id = v_isc_id;
      IF cardinality(v_log_ids) > 0 THEN
        UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = ANY(v_log_ids);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$function$;

CREATE OR REPLACE FUNCTION public.riconcilia_iscritto_whatsapp(_id uuid, _cliente_id uuid DEFAULT NULL::uuid, _lead_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_log_id uuid;
  v_contatto_id uuid;
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF (_cliente_id IS NULL AND _lead_id IS NULL) OR (_cliente_id IS NOT NULL AND _lead_id IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'specificare_uno_tra_cliente_o_lead');
  END IF;

  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato'); END IF;

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  )
  SELECT NULL, _cliente_id, _lead_id, 'whatsapp', true, 'link_pubblico',
    cl.ip_address, cl.user_agent, cl.informativa_versione, cl.informativa_hash, cl.secondi_permanenza,
    'Riconciliazione manuale iscritto WhatsApp'
  FROM (SELECT ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza
        FROM public.consensi_log WHERE id = v_isc.consenso_log_id) cl
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
    VALUES (NULL, _cliente_id, _lead_id, 'whatsapp', true, 'link_pubblico',
      'Riconciliazione manuale iscritto WhatsApp (iscritto puro)')
    RETURNING id INTO v_log_id;
  END IF;

  IF _cliente_id IS NOT NULL THEN
    v_contatto_id := public._crea_contatto_da_iscritto(_id, _cliente_id);
    IF v_contatto_id IS NOT NULL THEN
      UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = v_log_id;
    END IF;
  END IF;

  UPDATE public.iscritti_whatsapp
  SET cliente_id = _cliente_id,
      lead_id = _lead_id,
      contatto_id = COALESCE(v_contatto_id, contatto_id),
      consenso_log_id = COALESCE(v_log_id, consenso_log_id),
      stato = CASE WHEN _cliente_id IS NOT NULL THEN 'collegato_cliente' ELSE 'collegato_lead' END
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id, 'contatto_id', v_contatto_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rimatch_iscritti_whatsapp()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_cli uuid; v_cnt int; v_lead uuid; v_collegati int := 0; v_log_id uuid;
  v_az text; v_contatto_id uuid;
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  FOR r IN SELECT * FROM public.iscritti_whatsapp WHERE stato = 'nuovo' LOOP
    v_cli := NULL; v_lead := NULL; v_contatto_id := NULL;

    SELECT count(*) INTO v_cnt FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = r.numero_norm;
    IF v_cnt = 1 THEN
      SELECT id INTO v_cli FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = r.numero_norm LIMIT 1;
    END IF;

    IF v_cli IS NULL THEN
      SELECT count(*) INTO v_cnt FROM public.lead WHERE public.normalizza_numero_it(cellulare) = r.numero_norm;
      IF v_cnt = 1 THEN
        SELECT id INTO v_lead FROM public.lead WHERE public.normalizza_numero_it(cellulare) = r.numero_norm LIMIT 1;
      END IF;
    END IF;

    IF v_cli IS NULL AND v_lead IS NULL THEN
      v_az := public.normalizza_ragione_sociale(r.azienda);
      IF v_az IS NOT NULL AND length(v_az) >= 3 THEN
        SELECT count(*) INTO v_cnt FROM public.clienti WHERE public.normalizza_ragione_sociale(ragione_sociale) = v_az;
        IF v_cnt = 1 THEN
          SELECT id INTO v_cli FROM public.clienti WHERE public.normalizza_ragione_sociale(ragione_sociale) = v_az LIMIT 1;
        END IF;
      END IF;
    END IF;

    IF v_cli IS NOT NULL OR v_lead IS NOT NULL THEN
      INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
      VALUES (NULL, v_cli, v_lead, 'whatsapp', true, 'link_pubblico', 'Ri-match automatico iscritto WhatsApp')
      RETURNING id INTO v_log_id;

      IF v_cli IS NOT NULL THEN
        v_contatto_id := public._crea_contatto_da_iscritto(r.id, v_cli);
        IF v_contatto_id IS NOT NULL THEN
          UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = v_log_id;
        END IF;
      END IF;

      UPDATE public.iscritti_whatsapp
      SET cliente_id = v_cli, lead_id = v_lead, contatto_id = COALESCE(v_contatto_id, contatto_id),
          consenso_log_id = v_log_id,
          stato = CASE WHEN v_cli IS NOT NULL THEN 'collegato_cliente' ELSE 'collegato_lead' END
      WHERE id = r.id;
      v_collegati := v_collegati + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'collegati', v_collegati);
END;
$function$;