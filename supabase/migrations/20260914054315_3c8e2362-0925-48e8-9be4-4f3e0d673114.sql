ALTER TABLE public.consensi_log
  ADD COLUMN IF NOT EXISTS iscritto_id uuid REFERENCES public.iscritti_whatsapp(id) ON DELETE SET NULL;

ALTER TABLE public.consensi_log DROP CONSTRAINT IF EXISTS consensi_log_almeno_un_soggetto;
ALTER TABLE public.consensi_log ADD CONSTRAINT consensi_log_almeno_un_soggetto
  CHECK (contatto_id IS NOT NULL OR cliente_id IS NOT NULL OR lead_id IS NOT NULL OR iscritto_id IS NOT NULL);

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

  v_origine_log := CASE
    WHEN _origine = 'operatore' THEN 'operatore'
    WHEN _origine = 'qr_pagina' THEN 'qr_whatsapp'
    ELSE 'link_pubblico'
  END;

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

  v_stato := CASE
    WHEN v_cli IS NOT NULL THEN 'collegato_cliente'
    WHEN v_lead IS NOT NULL THEN 'collegato_lead'
    ELSE 'nuovo' END;
  v_esito := CASE WHEN v_cli IS NOT NULL OR v_lead IS NOT NULL THEN 'collegato' ELSE 'in_lista' END;

  -- 1) Prima la riga iscritto (upsert), così v_isc_id esiste per le prove
  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, azienda, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _azienda, _origine, v_stato, v_cli, v_lead, NULL
  )
  ON CONFLICT (numero_norm) WHERE (stato <> 'ignorato')
  DO UPDATE SET
    numero_raw = EXCLUDED.numero_raw,
    nome = COALESCE(NULLIF(btrim(EXCLUDED.nome),''), public.iscritti_whatsapp.nome),
    cognome = COALESCE(NULLIF(btrim(EXCLUDED.cognome),''), public.iscritti_whatsapp.cognome),
    email = COALESCE(NULLIF(btrim(EXCLUDED.email),''), public.iscritti_whatsapp.email),
    azienda = COALESCE(NULLIF(btrim(EXCLUDED.azienda),''), public.iscritti_whatsapp.azienda),
    cliente_id = COALESCE(EXCLUDED.cliente_id, public.iscritti_whatsapp.cliente_id),
    lead_id = COALESCE(EXCLUDED.lead_id, public.iscritti_whatsapp.lead_id),
    stato = EXCLUDED.stato
  RETURNING id INTO v_isc_id;

  -- 2) Prove GDPR SEMPRE, anche per l'iscritto puro (cliente_id/lead_id NULL, aggancio via iscritto_id)
  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    NULL, v_cli, v_lead, v_isc_id, 'whatsapp', true, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_log_id;
  v_log_ids := array_append(v_log_ids, v_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    NULL, v_cli, v_lead, v_isc_id, 'trattamento_dati', true, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    NULL, v_cli, v_lead, v_isc_id, 'marketing_diretto', _consenso_marketing, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  INSERT INTO public.consensi_log(
    contatto_id, cliente_id, lead_id, iscritto_id, tipo_consenso, valore, origine,
    ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
  ) VALUES (
    NULL, v_cli, v_lead, v_isc_id, 'profilazione', _consenso_profilazione, v_origine_log,
    _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
    'Iscrizione WhatsApp (' || _origine || ')'
  ) RETURNING id INTO v_optional_log_id;
  v_log_ids := array_append(v_log_ids, v_optional_log_id);

  -- 3) Aggancio della prova whatsapp all'iscritto
  UPDATE public.iscritti_whatsapp
  SET consenso_log_id = COALESCE(v_log_id, consenso_log_id)
  WHERE id = v_isc_id;

  IF v_cli IS NOT NULL THEN
    v_contatto_id := public._crea_contatto_da_iscritto(v_isc_id, v_cli);
    IF v_contatto_id IS NOT NULL THEN
      UPDATE public.iscritti_whatsapp SET contatto_id = v_contatto_id WHERE id = v_isc_id;
      IF cardinality(v_log_ids) > 0 THEN
        UPDATE public.consensi_log SET contatto_id = v_contatto_id WHERE id = ANY(v_log_ids);
      END IF;

      UPDATE public.contatti SET
        consenso_marketing_diretto = CASE WHEN _consenso_marketing THEN true ELSE consenso_marketing_diretto END,
        consenso_profilazione      = CASE WHEN _consenso_profilazione THEN true ELSE consenso_profilazione END,
        updated_at = now()
      WHERE id = v_contatto_id;
    END IF;
  END IF;

  IF v_cli IS NULL AND v_lead IS NULL THEN
    PERFORM public.auto_collega_iscritto_whatsapp(v_isc_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$function$;