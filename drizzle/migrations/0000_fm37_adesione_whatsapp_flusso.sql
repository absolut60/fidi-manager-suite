DROP FUNCTION IF EXISTS public.registra_adesione_evento_whatsapp(text);

CREATE FUNCTION public.registra_adesione_evento_whatsapp(_numero_raw text, _testo_bottone text DEFAULT NULL)
 RETURNS TABLE(ok boolean, evento_id uuid, gia_presente boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _digits text;
  _coda10 text;
  _contatto_id uuid;
  _cliente_id uuid;
  _camp_ev_id uuid;
  _template_id uuid;
  _msg_trovato boolean := false;
  _pulsante jsonb;
  _flusso text;
  _ev_id uuid;
BEGIN
  _digits := regexp_replace(coalesce(_numero_raw, ''), '\D', '', 'g');
  IF length(_digits) < 8 THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'numero non valido'::text;
    RETURN;
  END IF;
  _coda10 := right(_digits, 10);

  SELECT true, m.contatto_id, m.cliente_id, c.evento_id, c.template_id
  INTO _msg_trovato, _contatto_id, _cliente_id, _camp_ev_id, _template_id
  FROM messaggi_whatsapp m
  JOIN campagne_whatsapp c ON c.id = m.campagna_id
  WHERE m.stato IN ('inviato', 'consegnato', 'letto')
    AND right(regexp_replace(m.numero_dest, '\D', '', 'g'), 10) = _coda10
  ORDER BY m.inviato_at DESC NULLS LAST, m.created_at DESC
  LIMIT 1;

  IF NOT coalesce(_msg_trovato, false) THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'nessuna campagna trovata per il numero'::text;
    RETURN;
  END IF;

  IF _testo_bottone IS NULL OR btrim(_testo_bottone) = '' THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'pulsante non riconosciuto'::text;
    RETURN;
  END IF;

  SELECT p INTO _pulsante
  FROM whatsapp_template t,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.pulsanti) = 'array' THEN t.pulsanti ELSE '[]'::jsonb END) p
  WHERE t.id = _template_id
    AND p->>'tipo' = 'rapido'
    AND lower(btrim(p->>'testo')) = lower(btrim(_testo_bottone))
  LIMIT 1;

  IF _pulsante IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'pulsante non riconosciuto'::text;
    RETURN;
  END IF;

  _flusso := _pulsante->>'flusso';
  IF _flusso = 'disiscrizione' THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'disiscrizione'::text;
    RETURN;
  END IF;
  IF _flusso IS DISTINCT FROM 'evento' THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'pulsante non di adesione'::text;
    RETURN;
  END IF;

  _ev_id := COALESCE(NULLIF(btrim(_pulsante->>'evento_id'), '')::uuid, _camp_ev_id);
  IF _ev_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 'nessun evento collegato al pulsante'::text;
    RETURN;
  END IF;

  IF _contatto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM eventi_partecipanti ep
    WHERE ep.evento_id = _ev_id AND ep.contatto_id = _contatto_id
  ) THEN
    RETURN QUERY SELECT true, _ev_id, true, 'già presente'::text;
    RETURN;
  END IF;

  INSERT INTO eventi_partecipanti (evento_id, stato, contatto_id, cliente_id, note)
  VALUES (_ev_id, 'confermato', _contatto_id, _cliente_id, 'Adesione via WhatsApp');

  RETURN QUERY SELECT true, _ev_id, false, 'adesione registrata'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.registra_adesione_evento_whatsapp(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_adesione_evento_whatsapp(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.registra_adesione_evento_whatsapp(text, text) IS 'FM37: l''adesione nasce solo dal pulsante di risposta con flusso ''evento'' del template della campagna.';