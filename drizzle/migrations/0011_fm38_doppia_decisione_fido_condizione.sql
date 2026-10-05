ALTER TABLE public.richieste_fido
  ADD COLUMN esito_fido text CONSTRAINT richieste_fido_esito_fido_chk CHECK (esito_fido IN ('approvata','rifiutata')),
  ADD COLUMN esito_condizione_pagamento text CONSTRAINT richieste_fido_esito_cond_pag_chk CHECK (esito_condizione_pagamento IN ('approvata','rifiutata')),
  ADD COLUMN condizione_pagamento_precedente_cod text;

ALTER TABLE public.approvazioni
  ADD COLUMN esito_fido text CONSTRAINT approvazioni_esito_fido_chk CHECK (esito_fido IN ('approvata','rifiutata')),
  ADD COLUMN esito_condizione_pagamento text CONSTRAINT approvazioni_esito_cond_pag_chk CHECK (esito_condizione_pagamento IN ('approvata','rifiutata'));

CREATE OR REPLACE FUNCTION public.condizione_pagamento_cambiata(_proposta text, _attuale text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT COALESCE(btrim(_proposta), '') <> ''
     AND upper(btrim(_proposta)) IS DISTINCT FROM upper(NULLIF(btrim(COALESCE(_attuale, '')), ''))
$$;
COMMENT ON FUNCTION public.condizione_pagamento_cambiata(text, text) IS 'gemello SQL di condizionePagamentoCambiata (src/lib/fidi.ts)';

DROP FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric);

CREATE FUNCTION public.processa_richiesta_fido(
  _richiesta_id uuid, _esito text, _note text DEFAULT NULL, _importo_approvato numeric DEFAULT NULL,
  _esito_fido text DEFAULT NULL, _esito_condizione text DEFAULT NULL)
RETURNS richieste_fido
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _r public.richieste_fido;
  _uid uuid := auth.uid();
  _liv int;
  _imp numeric;
  _now timestamptz := now();
  _cond_attuale text;
  _fido_attuale numeric;
  _cambio boolean;
  _ef text;
  _ec text;
  _tot text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;
  IF _esito NOT IN ('approvata','rifiutata') THEN
    RAISE EXCEPTION 'Esito non valido: %', _esito;
  END IF;

  SELECT * INTO _r FROM public.richieste_fido WHERE id = _richiesta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Richiesta non trovata';
  END IF;

  IF _r.stato::text NOT IN ('in_approvazione','integrazioni_richieste') THEN
    RAISE EXCEPTION 'La richiesta non è in approvazione (stato=%).', _r.stato;
  END IF;

  _liv := public.livello_approvatore(_uid);
  IF NOT public.has_role(_uid, 'amministratore'::app_role)
     AND _liv < _r.livello_richiesto THEN
    RAISE EXCEPTION 'Permesso negato: livello utente % insufficiente per livello richiesto %.', _liv, _r.livello_richiesto;
  END IF;

  -- fido attuale = clienti.fido_gestionale (stessa fonte di getFidoAttuale, src/lib/fido-cliente.ts)
  SELECT c.condizione_pagamento_cod, c.fido_gestionale INTO _cond_attuale, _fido_attuale
    FROM public.clienti c WHERE c.id = _r.cliente_id;

  _cambio := public.condizione_pagamento_cambiata(_r.condizione_pagamento_cod, _cond_attuale);

  IF _esito_fido IS NULL THEN
    _ef := _esito;
    _ec := CASE WHEN _cambio THEN _esito ELSE NULL END;
  ELSE
    IF _esito_fido NOT IN ('approvata','rifiutata') THEN
      RAISE EXCEPTION 'Esito fido non valido: %', _esito_fido;
    END IF;
    _ef := _esito_fido;
    IF _cambio THEN
      IF _esito_condizione IS NULL OR _esito_condizione NOT IN ('approvata','rifiutata') THEN
        RAISE EXCEPTION 'Manca la decisione sulla condizione di pagamento';
      END IF;
      _ec := _esito_condizione;
    ELSE
      _ec := NULL;
    END IF;
  END IF;

  _tot := CASE WHEN _ef = 'approvata' OR _ec = 'approvata' THEN 'approvata' ELSE 'rifiutata' END;

  IF _ef = 'approvata' THEN
    _imp := COALESCE(_importo_approvato, _r.importo_richiesto);
  ELSIF _ec = 'approvata' THEN
    _imp := COALESCE(_fido_attuale, 0);
  ELSE
    _imp := NULL;
  END IF;

  INSERT INTO public.approvazioni (
    richiesta_id, approvatore_id, livello, esito, importo_approvato, note,
    esito_fido, esito_condizione_pagamento
  ) VALUES (
    _r.id, _uid, _r.livello_richiesto, _tot::esito_approvazione, _imp, NULLIF(_note, ''),
    _ef, _ec
  );

  IF _tot = 'approvata' THEN
    UPDATE public.richieste_fido
       SET stato = 'approvata',
           importo_approvato = _imp,
           approvato_da = _uid,
           data_approvazione = _now,
           data_chiusura = _now,
           esito_fido = _ef,
           esito_condizione_pagamento = _ec,
           condizione_pagamento_precedente_cod = CASE WHEN _cambio THEN _cond_attuale ELSE NULL END
     WHERE id = _r.id
     RETURNING * INTO _r;
  ELSE
    UPDATE public.richieste_fido
       SET stato = 'rifiutata',
           approvato_da = _uid,
           data_approvazione = _now,
           data_chiusura = _now,
           esito_fido = _ef,
           esito_condizione_pagamento = _ec,
           condizione_pagamento_precedente_cod = CASE WHEN _cambio THEN _cond_attuale ELSE NULL END
     WHERE id = _r.id
     RETURNING * INTO _r;
  END IF;

  RETURN _r;
END;
$function$;

REVOKE ALL ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric, text, text) TO authenticated, service_role;