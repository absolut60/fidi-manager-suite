ALTER TABLE public.clienti ADD COLUMN IF NOT EXISTS whatsapp text;

CREATE OR REPLACE FUNCTION public.riconcilia_iscritto_whatsapp(_id uuid, _cliente_id uuid DEFAULT NULL, _lead_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato');
  END IF;

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  )
  SELECT NULL, _cliente_id, _lead_id, 'whatsapp', true, 'link_pubblico',
    cl.ip_address, cl.user_agent, cl.informativa_versione, cl.informativa_hash, cl.secondi_permanenza,
    'Riconciliazione manuale iscritto WhatsApp'
  FROM (
    SELECT ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza
    FROM public.consensi_log
    WHERE id = v_isc.consenso_log_id
  ) cl
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
      stato = CASE
        WHEN _cliente_id IS NOT NULL THEN 'collegato_cliente'
        ELSE 'collegato_lead'
      END
  WHERE id = _id;

  -- NUOVO: scrivi il numero WhatsApp sul cliente, solo se non ne ha già uno
  IF _cliente_id IS NOT NULL AND v_isc.numero_norm IS NOT NULL THEN
    UPDATE public.clienti
    SET whatsapp = v_isc.numero_norm
    WHERE id = _cliente_id
      AND (whatsapp IS NULL OR btrim(whatsapp) = '');
  END IF;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_cliente(_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT whatsapp INTO v_numero FROM public.clienti WHERE id = _cliente_id;

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
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_cliente(uuid) TO authenticated, service_role, supabase_read_only_user;