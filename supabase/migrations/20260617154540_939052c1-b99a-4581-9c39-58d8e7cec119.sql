
CREATE OR REPLACE FUNCTION public.invia_comunicazione_richiesta(
  _richiesta_id uuid,
  _destinatario text,
  _testo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r record;
  _msg_id uuid;
  _ragione text;
  _destinatari uuid[] := ARRAY[]::uuid[];
  _approvatori uuid[];
  _allowed boolean;
  _preview text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;
  IF _destinatario NOT IN ('richiedente','approvatore','tutti') THEN
    RAISE EXCEPTION 'Destinatario non valido: %', _destinatario;
  END IF;
  IF _testo IS NULL OR btrim(_testo) = '' THEN
    RAISE EXCEPTION 'Testo vuoto';
  END IF;

  SELECT rf.id, rf.created_by, rf.cliente_id, rf.livello_richiesto, c.ragione_sociale
    INTO _r
  FROM public.richieste_fido rf
  LEFT JOIN public.clienti c ON c.id = rf.cliente_id
  WHERE rf.id = _richiesta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Richiesta non trovata';
  END IF;

  -- Autorizzazione: chiamante deve essere autore, admin/amministrazione,
  -- o avere ruolo di approvatore (qualsiasi livello).
  _allowed :=
    _r.created_by = _uid
    OR public.has_role(_uid, 'amministratore'::app_role)
    OR public.has_role(_uid, 'amministrazione'::app_role)
    OR public.has_role(_uid, 'direzione'::app_role)
    OR public.has_role(_uid, 'approvatore_liv1'::app_role)
    OR public.has_role(_uid, 'approvatore_liv2'::app_role)
    OR public.has_role(_uid, 'approvatore_liv3'::app_role);
  IF NOT _allowed THEN
    RAISE EXCEPTION 'Permesso negato';
  END IF;

  -- Salva messaggio
  INSERT INTO public.comunicazioni_richiesta (richiesta_id, autore_id, destinatario, testo, letto_da)
  VALUES (_richiesta_id, _uid, _destinatario, _testo, ARRAY[_uid]::uuid[])
  RETURNING id INTO _msg_id;

  -- Destinatario: richiedente
  IF _destinatario IN ('richiedente','tutti') THEN
    IF _r.created_by IS NOT NULL AND _r.created_by <> _uid THEN
      _destinatari := _destinatari || _r.created_by;
    END IF;
  END IF;

  -- Destinatario: approvatori (tutti gli approvatori + admin + amministrazione + direzione)
  IF _destinatario IN ('approvatore','tutti') THEN
    SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::uuid[]) INTO _approvatori
    FROM public.user_roles ur
    WHERE ur.role IN ('approvatore_liv1','approvatore_liv2','approvatore_liv3','amministratore','amministrazione','direzione')
      AND ur.user_id <> _uid;
    _destinatari := _destinatari || _approvatori;
  END IF;

  -- Dedup
  SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO _destinatari
  FROM unnest(_destinatari) AS u WHERE u IS NOT NULL;

  _preview := left(btrim(_testo), 140);
  IF length(btrim(_testo)) > 140 THEN _preview := _preview || '…'; END IF;
  _ragione := COALESCE(_r.ragione_sociale, '—');

  -- Notifiche in-app
  IF array_length(_destinatari, 1) > 0 THEN
    INSERT INTO public.notifiche (user_id, tipo, titolo, messaggio, link, metadata)
    SELECT
      u,
      'comunicazione_fido',
      'Nuovo messaggio su richiesta fido',
      _ragione || ': ' || _preview,
      '/richieste/' || _richiesta_id::text,
      jsonb_build_object('richiesta_id', _richiesta_id, 'comunicazione_id', _msg_id, 'destinatario', _destinatario)
    FROM unnest(_destinatari) AS u;
  END IF;

  RETURN jsonb_build_object(
    'comunicazione_id', _msg_id,
    'destinatari_user_ids', to_jsonb(_destinatari),
    'cliente', _ragione
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invia_comunicazione_richiesta(uuid, text, text) TO authenticated;
