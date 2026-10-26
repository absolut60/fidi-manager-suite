-- FM48: modulo iscrizione WhatsApp con impresa/privato, P.IVA/CF e sede di riferimento.
ALTER TABLE public.iscritti_whatsapp
  ADD COLUMN IF NOT EXISTS tipo_soggetto text NULL,
  ADD COLUMN IF NOT EXISTS partita_iva text NULL,
  ADD COLUMN IF NOT EXISTS codice_fiscale text NULL,
  ADD COLUMN IF NOT EXISTS store_id uuid NULL REFERENCES public.stores(id) ON DELETE SET NULL;
ALTER TABLE public.iscritti_whatsapp
  ADD CONSTRAINT iscritti_whatsapp_tipo_soggetto_check CHECK (tipo_soggetto IN ('azienda','persona_fisica'));

DROP FUNCTION public.registra_consenso_whatsapp(text,text,text,text,text,text,text,text,text,integer,text,boolean,boolean);

CREATE FUNCTION public.registra_consenso_whatsapp(_numero_raw text, _nome text DEFAULT NULL::text, _cognome text DEFAULT NULL::text, _email text DEFAULT NULL::text, _origine text DEFAULT 'link'::text, _ip text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _informativa_versione text DEFAULT NULL::text, _informativa_hash text DEFAULT NULL::text, _secondi_permanenza integer DEFAULT NULL::integer, _azienda text DEFAULT NULL::text, _consenso_marketing boolean DEFAULT false, _consenso_profilazione boolean DEFAULT false, _tipo_soggetto text DEFAULT NULL::text, _partita_iva text DEFAULT NULL::text, _codice_fiscale text DEFAULT NULL::text, _store_id uuid DEFAULT NULL::uuid)
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
  v_tipo text; v_piva text; v_cf text;
BEGIN
  v_tipo := CASE WHEN _tipo_soggetto IN ('azienda','persona_fisica') THEN _tipo_soggetto ELSE NULL END;
  v_piva := NULLIF(regexp_replace(coalesce(_partita_iva,''), '\D', '', 'g'), '');
  v_cf := NULLIF(upper(regexp_replace(coalesce(_codice_fiscale,''), '\s', '', 'g')), '');
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
    numero_norm, numero_raw, nome, cognome, email, azienda, origine, stato, cliente_id, lead_id, consenso_log_id,
    tipo_soggetto, partita_iva, codice_fiscale, store_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _azienda, _origine, 'nuovo', NULL, NULL, NULL,
    v_tipo, v_piva, v_cf, _store_id
  )
  ON CONFLICT (numero_norm) WHERE (stato <> 'ignorato')
  DO UPDATE SET
    numero_raw = EXCLUDED.numero_raw,
    nome = COALESCE(NULLIF(btrim(EXCLUDED.nome),''), public.iscritti_whatsapp.nome),
    cognome = COALESCE(NULLIF(btrim(EXCLUDED.cognome),''), public.iscritti_whatsapp.cognome),
    email = COALESCE(NULLIF(btrim(EXCLUDED.email),''), public.iscritti_whatsapp.email),
    azienda = COALESCE(NULLIF(btrim(EXCLUDED.azienda),''), public.iscritti_whatsapp.azienda),
    tipo_soggetto = COALESCE(EXCLUDED.tipo_soggetto, public.iscritti_whatsapp.tipo_soggetto),
    partita_iva = COALESCE(EXCLUDED.partita_iva, public.iscritti_whatsapp.partita_iva),
    codice_fiscale = COALESCE(EXCLUDED.codice_fiscale, public.iscritti_whatsapp.codice_fiscale),
    store_id = COALESCE(EXCLUDED.store_id, public.iscritti_whatsapp.store_id),
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

REVOKE ALL ON FUNCTION public.registra_consenso_whatsapp(text,text,text,text,text,text,text,text,text,integer,text,boolean,boolean,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp(text,text,text,text,text,text,text,text,text,integer,text,boolean,boolean,text,text,text,uuid) TO service_role;

-- Il lead creato dall'iscritto eredita tipo soggetto, P.IVA, CF e sede (lead nuovo: nessuna sovrascrittura).
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

  INSERT INTO public.lead(ragione_sociale, nome, cognome, cellulare, email, fonte, fonte_dettaglio, note,
    tipo_soggetto, partita_iva, codice_fiscale, store_id)
  VALUES (
    NULLIF(btrim(coalesce(v_isc.azienda,'')), ''),
    NULLIF(btrim(v_isc.nome), ''),
    NULLIF(btrim(v_isc.cognome), ''),
    v_isc.numero_norm,
    NULLIF(btrim(coalesce(v_isc.email,'')), ''),
    'web',
    'Iscrizione WhatsApp',
    'Creato da iscritto WhatsApp (' || coalesce(v_isc.origine,'link') || ')',
    v_isc.tipo_soggetto, v_isc.partita_iva, v_isc.codice_fiscale, v_isc.store_id
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