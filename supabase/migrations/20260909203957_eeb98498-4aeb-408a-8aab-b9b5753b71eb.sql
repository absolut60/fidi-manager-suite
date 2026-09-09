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

  INSERT INTO public.lead(ragione_sociale, nome, cognome, cellulare, fonte, fonte_dettaglio, note)
  VALUES (
    NULLIF(btrim(coalesce(v_isc.azienda,'')), ''),
    NULLIF(btrim(v_isc.nome), ''),
    NULLIF(btrim(v_isc.cognome), ''),
    v_isc.numero_norm,
    'web',
    'Iscrizione WhatsApp',
    'Creato da iscritto WhatsApp (' || coalesce(v_isc.origine,'link') || ')'
  ) RETURNING id INTO v_lead_id;

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  )
  SELECT NULL, NULL, v_lead_id, 'whatsapp', true, 'link_pubblico',
    cl.ip_address, cl.user_agent, cl.informativa_versione, cl.informativa_hash, cl.secondi_permanenza,
    'Creazione lead da iscritto WhatsApp'
  FROM (SELECT ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza
        FROM public.consensi_log WHERE id = v_isc.consenso_log_id) cl
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    INSERT INTO public.consensi_log(contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, note)
    VALUES (NULL, NULL, v_lead_id, 'whatsapp', true, 'link_pubblico',
      'Creazione lead da iscritto WhatsApp (iscritto puro)')
    RETURNING id INTO v_log_id;
  END IF;

  UPDATE public.iscritti_whatsapp
  SET lead_id = v_lead_id,
      consenso_log_id = COALESCE(v_log_id, consenso_log_id),
      stato = 'collegato_lead'
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'log_id', v_log_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crea_lead_da_iscritto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crea_lead_da_iscritto(uuid) TO service_role;