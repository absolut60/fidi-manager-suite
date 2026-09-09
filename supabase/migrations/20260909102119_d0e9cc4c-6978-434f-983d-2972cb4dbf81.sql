CREATE OR REPLACE FUNCTION public.ignora_iscritto_whatsapp(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  UPDATE public.iscritti_whatsapp SET stato = 'ignorato' WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.riconcilia_iscritto_whatsapp(
  _id uuid, _cliente_id uuid DEFAULT NULL, _lead_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_isc public.iscritti_whatsapp%ROWTYPE;
  v_log_id uuid;
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
    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note
    ) VALUES (
      NULL, _cliente_id, _lead_id, 'whatsapp', true, 'link_pubblico',
      'Riconciliazione manuale iscritto WhatsApp (iscritto puro)'
    ) RETURNING id INTO v_log_id;
  END IF;

  UPDATE public.iscritti_whatsapp
  SET cliente_id = _cliente_id,
      lead_id = _lead_id,
      consenso_log_id = COALESCE(v_log_id, consenso_log_id),
      stato = CASE WHEN _cliente_id IS NOT NULL THEN 'collegato_cliente' ELSE 'collegato_lead' END
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rimatch_iscritti_whatsapp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_cli uuid; v_cnt int; v_lead uuid; v_collegati int := 0; v_log_id uuid;
BEGIN
  IF NOT public.auth_ha_ruolo_globale_clienti() THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  FOR r IN SELECT * FROM public.iscritti_whatsapp WHERE stato = 'nuovo' LOOP
    v_cli := NULL; v_lead := NULL;

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

    IF v_cli IS NOT NULL OR v_lead IS NOT NULL THEN
      INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
      VALUES (NULL, v_cli, v_lead, 'whatsapp', true, 'link_pubblico', 'Ri-match automatico iscritto WhatsApp')
      RETURNING id INTO v_log_id;

      UPDATE public.iscritti_whatsapp
      SET cliente_id = v_cli, lead_id = v_lead, consenso_log_id = v_log_id,
          stato = CASE WHEN v_cli IS NOT NULL THEN 'collegato_cliente' ELSE 'collegato_lead' END
      WHERE id = r.id;
      v_collegati := v_collegati + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'collegati', v_collegati);
END;
$$;