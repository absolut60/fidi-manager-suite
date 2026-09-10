ALTER TABLE public.consensi_log
  DROP CONSTRAINT consensi_log_tipo_consenso_check;

ALTER TABLE public.consensi_log
  ADD CONSTRAINT consensi_log_tipo_consenso_check
  CHECK (tipo_consenso = ANY (ARRAY[
    'marketing_diretto'::text,
    'marketing_media'::text,
    'profilazione'::text,
    'whatsapp'::text,
    'trattamento_dati'::text
  ]));

CREATE OR REPLACE FUNCTION public.registra_consensi_batch(
  _contatto_id uuid,
  _marketing_diretto boolean,
  _marketing_media boolean,
  _profilazione boolean,
  _origine text,
  _operatore_id uuid DEFAULT NULL::uuid,
  _prova_path text DEFAULT NULL::text,
  _ip text DEFAULT NULL::text,
  _note text DEFAULT NULL::text,
  _informativa_versione text DEFAULT NULL::text,
  _informativa_hash text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _secondi_permanenza integer DEFAULT NULL::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_lead_id uuid;
BEGIN
  SELECT c.cliente_id, c.lead_id INTO v_cliente_id, v_lead_id
    FROM public.contatti c WHERE c.id = _contatto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contatto % non trovato', _contatto_id;
  END IF;

  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import','firma_grafica','di_persona') THEN
    RAISE EXCEPTION 'Origine non valida: %', _origine;
  END IF;

  INSERT INTO public.consensi_log
    (contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine, operatore_id, prova_path, ip_address, note,
     informativa_versione, informativa_hash, user_agent, secondi_permanenza)
  VALUES
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_diretto', _marketing_diretto, _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'marketing_media',   _marketing_media,   _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'profilazione',      _profilazione,      _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'trattamento_dati',  true,                _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza),
    (_contatto_id, v_cliente_id, v_lead_id, 'whatsapp',          _marketing_diretto,  _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(
  _numero_raw text,
  _nome text DEFAULT NULL::text,
  _cognome text DEFAULT NULL::text,
  _email text DEFAULT NULL::text,
  _origine text DEFAULT 'link'::text,
  _ip text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _informativa_versione text DEFAULT NULL::text,
  _informativa_hash text DEFAULT NULL::text,
  _secondi_permanenza integer DEFAULT NULL::integer,
  _azienda text DEFAULT NULL::text,
  _consenso_marketing boolean DEFAULT false,
  _consenso_profilazione boolean DEFAULT false
)
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

    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'trattamento_dati', true, v_origine_log,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
      'Iscrizione WhatsApp (' || _origine || ')'
    ) RETURNING id INTO v_optional_log_id;
    v_log_ids := array_append(v_log_ids, v_optional_log_id);

    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'marketing_diretto', _consenso_marketing, v_origine_log,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
      'Iscrizione WhatsApp (' || _origine || ')'
    ) RETURNING id INTO v_optional_log_id;
    v_log_ids := array_append(v_log_ids, v_optional_log_id);

    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'profilazione', _consenso_profilazione, v_origine_log,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza,
      'Iscrizione WhatsApp (' || _origine || ')'
    ) RETURNING id INTO v_optional_log_id;
    v_log_ids := array_append(v_log_ids, v_optional_log_id);
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

      UPDATE public.contatti SET
        consenso_marketing_diretto = CASE WHEN _consenso_marketing THEN true ELSE consenso_marketing_diretto END,
        consenso_profilazione      = CASE WHEN _consenso_profilazione THEN true ELSE consenso_profilazione END,
        updated_at = now()
      WHERE id = v_contatto_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$function$;