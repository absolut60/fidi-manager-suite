ALTER TABLE public.richieste_fido
  ADD COLUMN IF NOT EXISTS condizione_pagamento_richiesta_cod text,
  ADD COLUMN IF NOT EXISTS condizione_pagamento_modificata boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.richieste_fido.condizione_pagamento_richiesta_cod IS
  'Condizione di pagamento proposta in origine dal richiedente, valorizzata SOLO se l''approvatore ne ha approvata una diversa (condizione_pagamento_modificata = true). Può essere NULL anche con flag true (richiesta nata senza proposta di cambio).';
COMMENT ON COLUMN public.richieste_fido.condizione_pagamento_modificata IS
  'true se in approvazione è stata approvata una condizione diversa da quella proposta dal richiedente. In quel caso condizione_pagamento_cod contiene la condizione APPROVATA.';

DROP FUNCTION IF EXISTS public.processa_richiesta_fido(uuid, text, text, numeric, text, text);

CREATE FUNCTION public.processa_richiesta_fido(
  _richiesta_id uuid,
  _esito text,
  _note text DEFAULT NULL::text,
  _importo_approvato numeric DEFAULT NULL::numeric,
  _esito_fido text DEFAULT NULL::text,
  _esito_condizione text DEFAULT NULL::text,
  _condizione_approvata_cod text DEFAULT NULL::text
)
 RETURNS richieste_fido
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  _cond_orig text;
  _cond_finale text;
  _override text;
  _usa_override boolean := false;
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

  -- Condizione approvata diversa dalla proposta (facoltativa)
  _cond_orig := _r.condizione_pagamento_cod;
  _cond_finale := _cond_orig;
  _override := NULLIF(upper(btrim(COALESCE(_condizione_approvata_cod, ''))), '');
  IF _override IS NOT NULL
     AND _override IS DISTINCT FROM NULLIF(upper(btrim(COALESCE(_cond_orig, ''))), '') THEN
    IF _esito_fido IS NULL OR _esito_condizione IS DISTINCT FROM 'approvata' THEN
      RAISE EXCEPTION 'Una condizione di pagamento diversa dalla proposta può essere indicata solo approvando la condizione di pagamento';
    END IF;
    SELECT cp.cod INTO _cond_finale FROM public.codici_pagamento cp
     WHERE upper(btrim(cp.cod)) = _override LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Codice di pagamento inesistente: %', _override;
    END IF;
    IF NOT public.condizione_pagamento_cambiata(_cond_finale, _cond_attuale) THEN
      RAISE EXCEPTION 'La condizione scelta coincide con quella attuale del cliente: usa "Non approvare"';
    END IF;
    _usa_override := true;
  END IF;

  _cambio := public.condizione_pagamento_cambiata(_cond_finale, _cond_attuale);

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
           condizione_pagamento_precedente_cod = CASE WHEN _cambio THEN _cond_attuale ELSE NULL END,
           condizione_pagamento_cod = CASE WHEN _usa_override THEN _cond_finale ELSE condizione_pagamento_cod END,
           condizione_pagamento_richiesta_cod = CASE WHEN _usa_override THEN _cond_orig ELSE condizione_pagamento_richiesta_cod END,
           condizione_pagamento_modificata = CASE WHEN _usa_override THEN true ELSE condizione_pagamento_modificata END
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

REVOKE ALL ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';