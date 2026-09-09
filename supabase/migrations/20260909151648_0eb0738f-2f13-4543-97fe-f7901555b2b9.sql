CREATE OR REPLACE FUNCTION public.normalizza_ragione_sociale(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          upper(translate(coalesce(_s,''), '.,-''`', '     ')),
          '\s*(S\s*P\s*A|S\s*R\s*L\s*S|S\s*R\s*L|S\s*N\s*C|S\s*A\s*S)\s*$', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ), ''
  );
$$;

CREATE OR REPLACE FUNCTION public._crea_contatto_da_iscritto(_isc_id uuid, _cliente_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_contatto_id uuid;
BEGIN
  SELECT * INTO v_isc FROM public.iscritti_whatsapp WHERE id = _isc_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_contatto_id
  FROM public.contatti
  WHERE cliente_id = _cliente_id
    AND (public.normalizza_numero_it(cellulare) = v_isc.numero_norm
         OR public.normalizza_numero_it(whatsapp) = v_isc.numero_norm)
  LIMIT 1;

  IF v_contatto_id IS NOT NULL THEN
    UPDATE public.contatti
    SET whatsapp = COALESCE(whatsapp, v_isc.numero_norm),
        whatsapp_opt_in = true,
        updated_at = now()
    WHERE id = v_contatto_id;
    RETURN v_contatto_id;
  END IF;

  INSERT INTO public.contatti(
    cliente_id, nome, cognome, ruolo, cellulare, whatsapp, whatsapp_opt_in, principale
  ) VALUES (
    _cliente_id,
    COALESCE(NULLIF(btrim(v_isc.nome),''), 'Contatto'),
    NULLIF(btrim(v_isc.cognome),''),
    'Contatto WhatsApp',
    v_isc.numero_norm,
    v_isc.numero_norm,
    true,
    false
  ) RETURNING id INTO v_contatto_id;

  RETURN v_contatto_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.riconcilia_iscritto_whatsapp(_id uuid, _cliente_id uuid DEFAULT NULL, _lead_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  IF _cliente_id IS NOT NULL AND v_isc.numero_norm IS NOT NULL THEN
    UPDATE public.clienti SET whatsapp = v_isc.numero_norm
    WHERE id = _cliente_id AND (whatsapp IS NULL OR btrim(whatsapp) = '');
  END IF;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id, 'contatto_id', v_contatto_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rimatch_iscritti_whatsapp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        UPDATE public.clienti SET whatsapp = r.numero_norm
        WHERE id = v_cli AND (whatsapp IS NULL OR btrim(whatsapp) = '');
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
$$;

GRANT EXECUTE ON FUNCTION public.normalizza_ragione_sociale(text) TO authenticated, service_role, supabase_read_only_user, anon;
GRANT EXECUTE ON FUNCTION public._crea_contatto_da_iscritto(uuid, uuid) TO authenticated, service_role;