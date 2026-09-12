CREATE OR REPLACE FUNCTION public.aggiorna_stato_messaggio_whatsapp(
  _meta_message_id text,
  _nuovo_stato text,
  _errore text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _mw public.messaggi_whatsapp%ROWTYPE;
  _stato_interno public.stato_messaggio_wa;
  _rango_attuale int;
  _rango_nuovo int;
BEGIN
  -- Validazione input
  IF _meta_message_id IS NULL OR _meta_message_id = '' THEN
    RETURN false;
  END IF;

  -- Trova il messaggio e bloccalo per evitare race condition sui contatori
  SELECT *
  INTO _mw
  FROM public.messaggi_whatsapp AS mw
  WHERE mw.meta_message_id = _meta_message_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Mappa lo stato Meta a quello interno
  CASE lower(_nuovo_stato)
    WHEN 'sent'      THEN _stato_interno := 'inviato';
    WHEN 'delivered' THEN _stato_interno := 'consegnato';
    WHEN 'read'      THEN _stato_interno := 'letto';
    WHEN 'failed'    THEN _stato_interno := 'fallito';
    ELSE RETURN false;
  END CASE;

  -- Idempotenza: già nello stato target
  IF _mw.stato = _stato_interno THEN
    RETURN true;
  END IF;

  -- Calcola ranghi di avanzamento
  _rango_attuale := CASE _mw.stato
    WHEN 'inviato'     THEN 1
    WHEN 'consegnato'  THEN 2
    WHEN 'letto'       THEN 3
    ELSE 0
  END;

  _rango_nuovo := CASE _stato_interno
    WHEN 'inviato'     THEN 1
    WHEN 'consegnato'  THEN 2
    WHEN 'letto'       THEN 3
    ELSE 0
  END;

  -- Anti-regressione: non declassare uno stato già avanzato
  IF _rango_attuale > 0
     AND _rango_nuovo > 0
     AND _rango_nuovo < _rango_attuale THEN
    RETURN true;
  END IF;

  -- Fallito si applica solo se non è già stato consegnato o letto
  IF _stato_interno = 'fallito'
     AND _mw.stato IN ('consegnato', 'letto') THEN
    RETURN true;
  END IF;

  -- Applica lo stato e i timestamp corrispondenti
  UPDATE public.messaggi_whatsapp
  SET
    stato = _stato_interno,
    consegnato_at = CASE
      WHEN _stato_interno = 'consegnato' AND _mw.consegnato_at IS NULL THEN now()
      WHEN _stato_interno = 'letto'      AND _mw.consegnato_at IS NULL THEN now()
      ELSE _mw.consegnato_at
    END,
    letto_at = CASE
      WHEN _stato_interno = 'letto' AND _mw.letto_at IS NULL THEN now()
      ELSE _mw.letto_at
    END,
    errore = CASE
      WHEN _stato_interno = 'fallito' THEN left(_errore, 500)
      ELSE _mw.errore
    END
  WHERE id = _mw.id;

  -- Aggiorna i contatori della campagna SOLO su transizione inviato → fallito
  IF _mw.stato = 'inviato' AND _stato_interno = 'fallito' THEN
    UPDATE public.campagne_whatsapp
    SET
      invii_falliti = invii_falliti + 1,
      invii_ok      = GREATEST(invii_ok - 1, 0)
    WHERE id = _mw.campagna_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aggiorna_stato_messaggio_whatsapp(text, text, text) TO anon, authenticated, service_role;