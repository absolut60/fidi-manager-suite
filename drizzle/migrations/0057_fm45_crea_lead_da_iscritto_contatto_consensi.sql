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
  v_mkt boolean;
  v_prof boolean;
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

  -- Consensi: ultimo valore per tipo dalle prove dell'iscritto
  SELECT valore INTO v_mkt FROM public.consensi_log
   WHERE iscritto_id = _id AND tipo_consenso = 'marketing_diretto'
   ORDER BY created_at DESC LIMIT 1;
  SELECT valore INTO v_prof FROM public.consensi_log
   WHERE iscritto_id = _id AND tipo_consenso = 'profilazione'
   ORDER BY created_at DESC LIMIT 1;

  -- Contatto del lead (helper esistenti non adatti: _crea_contatto_da_iscritto è solo per clienti,
  -- crea_o_riusa_contatto_in_soggetto richiede cognome e permesso eventi)
  INSERT INTO public.contatti(
    cliente_id, lead_id, nome, cognome, ruolo, cellulare, email,
    whatsapp_opt_in, principale, consenso_marketing_diretto, consenso_profilazione
  ) VALUES (
    NULL, v_lead_id,
    COALESCE(NULLIF(btrim(v_isc.nome),''), 'Contatto'),
    NULLIF(btrim(v_isc.cognome),''),
    'Contatto WhatsApp',
    v_isc.numero_norm,
    NULLIF(btrim(coalesce(v_isc.email,'')), ''),
    true, true,
    (v_mkt IS TRUE), (v_prof IS TRUE)
  ) RETURNING id INTO v_contatto_id;

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