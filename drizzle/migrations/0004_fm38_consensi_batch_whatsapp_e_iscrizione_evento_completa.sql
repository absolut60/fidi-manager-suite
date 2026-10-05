DROP FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer);

CREATE FUNCTION public.registra_consensi_batch(_contatto_id uuid, _marketing_diretto boolean, _marketing_media boolean, _profilazione boolean, _origine text, _operatore_id uuid DEFAULT NULL::uuid, _prova_path text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _note text DEFAULT NULL::text, _informativa_versione text DEFAULT NULL::text, _informativa_hash text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text, _secondi_permanenza integer DEFAULT NULL::integer, _whatsapp boolean DEFAULT NULL::boolean)
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

  IF _origine NOT IN ('link_pubblico','operatore','recesso_link','import','firma_grafica','di_persona','azienda_gruppo') THEN
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
    (_contatto_id, v_cliente_id, v_lead_id, 'whatsapp',          coalesce(_whatsapp, _marketing_diretto), _origine, _operatore_id, _prova_path, _ip, _note, _informativa_versione, _informativa_hash, _user_agent, _secondi_permanenza);

  UPDATE public.contatti
     SET consenso_marketing_diretto = _marketing_diretto,
         consenso_marketing_media   = _marketing_media,
         consenso_profilazione      = _profilazione,
         updated_at = now()
   WHERE id = _contatto_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer, boolean) TO service_role;

COMMENT ON FUNCTION public.registra_consensi_batch(uuid, boolean, boolean, boolean, text, uuid, text, text, text, text, text, text, integer, boolean) IS 'FM38: _whatsapp facoltativo; se NULL la riga whatsapp segue _marketing_diretto come prima (comportamento storico invariato).';

DROP FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text);

CREATE FUNCTION public.registra_iscrizione_evento_pubblica(_codice text, _nome text, _cognome text, _cellulare text, _email text, _azienda text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, gia_presente boolean, motivo text, contatto_id uuid, nome_evento text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _ev record;
  _digits text;
  v_email text;
  v_azienda boolean;
  v_lead_id uuid;
  v_contatto_id uuid;
BEGIN
  SELECT e.id, e.nome, e.iscrizioni_aperte, e.data_evento INTO _ev
    FROM public.eventi e
   WHERE nullif(btrim(coalesce(_codice, '')), '') IS NOT NULL
     AND e.codice_pubblico = btrim(_codice);
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'evento_non_trovato'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF NOT public.evento_iscrizioni_aperte(_ev.iscrizioni_aperte, _ev.data_evento) THEN
    RETURN QUERY SELECT false, false, 'iscrizioni_chiuse'::text, NULL::uuid, _ev.nome; RETURN;
  END IF;

  IF coalesce(btrim(_nome), '') = '' OR coalesce(btrim(_cognome), '') = '' THEN
    RETURN QUERY SELECT false, false, 'dati_mancanti'::text, NULL::uuid, _ev.nome; RETURN;
  END IF;

  v_email := nullif(lower(btrim(_email)), '');
  IF v_email IS NULL OR NOT public.fn_email_valida(v_email) THEN
    RETURN QUERY SELECT false, false, 'email_non_valida'::text, NULL::uuid, _ev.nome; RETURN;
  END IF;

  _digits := regexp_replace(coalesce(_cellulare, ''), '\D', '', 'g');
  IF length(_digits) < 8 THEN
    RETURN QUERY SELECT false, false, 'numero_non_valido'::text, NULL::uuid, _ev.nome; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('iscr_evento:' || _ev.id::text || ':' || right(_digits, 10)));

  IF EXISTS (
    SELECT 1 FROM public.eventi_partecipanti p
     WHERE p.evento_id = _ev.id
       AND right(regexp_replace(coalesce(p.telefono, ''), '\D', '', 'g'), 10) = right(_digits, 10)
  ) THEN
    RETURN QUERY SELECT true, true, 'gia_presente'::text, NULL::uuid, _ev.nome; RETURN;
  END IF;

  v_azienda := nullif(btrim(_azienda), '') IS NOT NULL;

  INSERT INTO public.lead (tipo_soggetto, ragione_sociale, nome, cognome, email, cellulare, fonte, fonte_dettaglio, tipo_lead, priorita, stato, created_by)
  VALUES (CASE WHEN v_azienda THEN 'azienda' ELSE 'persona_fisica' END, nullif(btrim(_azienda), ''), btrim(_nome), btrim(_cognome), v_email, btrim(_cellulare), 'evento', _ev.nome, 'potenziale_cliente', 'media', 'nuovo', NULL)
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_storico (lead_id, stato_da, stato_a, operatore_id, nota)
  VALUES (v_lead_id, NULL, 'nuovo', NULL, 'Lead creato dall''iscrizione online all''evento: ' || _ev.nome);

  INSERT INTO public.contatti (lead_id, cliente_id, nome, cognome, email, cellulare, ruolo, principale)
  VALUES (v_lead_id, NULL, btrim(_nome), btrim(_cognome), v_email, btrim(_cellulare), CASE WHEN v_azienda THEN 'Referente' ELSE NULL END, false)
  RETURNING id INTO v_contatto_id;

  INSERT INTO public.eventi_partecipanti (evento_id, stato, lead_id, cliente_id, contatto_id, nome, cognome, ragione_sociale, email, telefono, origine, note, registrato_sul_posto)
  VALUES (_ev.id, 'atteso', v_lead_id, NULL, v_contatto_id, btrim(_nome), btrim(_cognome), nullif(btrim(_azienda), ''), v_email, btrim(_cellulare), 'iscrizione_online', 'Iscrizione online (QR/link)', false);

  RETURN QUERY SELECT true, false, 'iscrizione_registrata'::text, v_contatto_id, _ev.nome;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.registra_iscrizione_evento_pubblica(text, text, text, text, text, text) IS 'FM38: iscrizione pubblica a un evento. Crea lead provvisorio (fonte evento) + contatto + partecipante, come gli iscritti sul posto; la privacy viene poi finalizzata lato server sul contatto restituito.';