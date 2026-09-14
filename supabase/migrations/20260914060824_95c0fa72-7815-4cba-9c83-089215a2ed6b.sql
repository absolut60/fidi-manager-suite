CREATE OR REPLACE FUNCTION public.auto_collega_iscritto_whatsapp(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cls jsonb;
  v_esito text;
  v_cliente uuid;
  v_log_id uuid;
  v_contatto_id uuid;
BEGIN
  v_cls := public.classifica_iscritto_whatsapp(_id);
  v_esito := v_cls->>'esito';
  IF v_esito IS DISTINCT FROM 'collega_auto' THEN
    RETURN NULL;
  END IF;
  v_cliente := ((v_cls->'candidati_clienti')->0->>'cliente_id')::uuid;
  IF v_cliente IS NULL THEN RETURN NULL; END IF;

  v_contatto_id := public._crea_contatto_da_iscritto(_id, v_cliente);

  IF EXISTS (SELECT 1 FROM public.consensi_log WHERE iscritto_id = _id) THEN
    -- Adotta le righe di prova originali dell'iscritto
    UPDATE public.consensi_log
    SET contatto_id = COALESCE(v_contatto_id, contatto_id),
        cliente_id  = COALESCE(v_cliente, cliente_id)
    WHERE iscritto_id = _id;

    SELECT id INTO v_log_id
    FROM public.consensi_log
    WHERE iscritto_id = _id AND tipo_consenso = 'whatsapp'
    ORDER BY created_at
    LIMIT 1;
  ELSE
    -- Fallback per iscritti storici senza prova salvata
    INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
    VALUES (v_contatto_id, v_cliente, NULL, 'whatsapp', true, 'link_pubblico',
      'Collegamento automatico iscritto WhatsApp (iscritto puro, prova non salvata)')
    RETURNING id INTO v_log_id;
  END IF;

  UPDATE public.iscritti_whatsapp
  SET cliente_id = v_cliente,
      contatto_id = COALESCE(v_contatto_id, contatto_id),
      consenso_log_id = COALESCE(v_log_id, consenso_log_id),
      stato = 'collegato_cliente'
  WHERE id = _id;

  RETURN v_cliente;
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

  IF _cliente_id IS NOT NULL THEN
    v_contatto_id := public._crea_contatto_da_iscritto(_id, _cliente_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.consensi_log WHERE iscritto_id = _id) THEN
    -- Adotta le righe di prova originali dell'iscritto
    UPDATE public.consensi_log
    SET contatto_id = COALESCE(v_contatto_id, contatto_id),
        cliente_id  = COALESCE(_cliente_id, cliente_id),
        lead_id     = COALESCE(_lead_id, lead_id)
    WHERE iscritto_id = _id;

    SELECT id INTO v_log_id
    FROM public.consensi_log
    WHERE iscritto_id = _id AND tipo_consenso = 'whatsapp'
    ORDER BY created_at
    LIMIT 1;
  ELSE
    -- Fallback per iscritti storici senza prova salvata
    INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
    VALUES (v_contatto_id, _cliente_id, _lead_id, 'whatsapp', true, 'link_pubblico',
      'Riconciliazione manuale iscritto WhatsApp (iscritto puro, prova non salvata)')
    RETURNING id INTO v_log_id;
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