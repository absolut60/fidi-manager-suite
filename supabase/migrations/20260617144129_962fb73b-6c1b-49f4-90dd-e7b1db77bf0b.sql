
-- 1) Migra le richieste residue
UPDATE public.richieste_fido
   SET stato = 'in_approvazione'
 WHERE stato::text IN ('in_attesa_liv1','in_attesa_liv2','in_attesa_liv3');

-- 2) Helper: livello massimo dell'utente come approvatore (0 se nessuno)
CREATE OR REPLACE FUNCTION public.livello_approvatore(_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(
    CASE role::text
      WHEN 'approvatore_liv3' THEN 3
      WHEN 'approvatore_liv2' THEN 2
      WHEN 'approvatore_liv1' THEN 1
      ELSE 0
    END
  ), 0)
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

GRANT EXECUTE ON FUNCTION public.livello_approvatore(uuid) TO authenticated;

-- 3) Funzione SECURITY DEFINER: assenso singolo (approva o rifiuta)
CREATE OR REPLACE FUNCTION public.processa_richiesta_fido(
  _richiesta_id uuid,
  _esito text,
  _note text DEFAULT NULL,
  _importo_approvato numeric DEFAULT NULL
)
RETURNS public.richieste_fido
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.richieste_fido;
  _uid uuid := auth.uid();
  _liv int;
  _imp numeric;
  _now timestamptz := now();
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

  INSERT INTO public.approvazioni (
    richiesta_id, approvatore_id, livello, esito, importo_approvato, note
  ) VALUES (
    _r.id, _uid, _r.livello_richiesto, _esito::esito_approvazione,
    CASE WHEN _esito = 'approvata' THEN COALESCE(_importo_approvato, _r.importo_richiesto) ELSE NULL END,
    NULLIF(_note, '')
  );

  IF _esito = 'approvata' THEN
    _imp := COALESCE(_importo_approvato, _r.importo_richiesto);
    UPDATE public.richieste_fido
       SET stato = 'approvata',
           importo_approvato = _imp,
           approvato_da = _uid,
           data_approvazione = _now,
           data_chiusura = _now
     WHERE id = _r.id
     RETURNING * INTO _r;
  ELSE
    UPDATE public.richieste_fido
       SET stato = 'rifiutata',
           approvato_da = _uid,
           data_approvazione = _now,
           data_chiusura = _now
     WHERE id = _r.id
     RETURNING * INTO _r;
  END IF;

  RETURN _r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.processa_richiesta_fido(uuid, text, text, numeric) TO authenticated;

-- 4) RLS richieste_fido — SELECT (rimuove store_id; aggiunge direzione)
DROP POLICY IF EXISTS "Richieste: visibili admin/approvatori/own store" ON public.richieste_fido;
CREATE POLICY "Richieste: select per ruolo o autore"
ON public.richieste_fido
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR created_by = auth.uid()
);

-- 5) RLS richieste_fido — UPDATE: gli approvatori NON modificano i campi via UPDATE
DROP POLICY IF EXISTS "Richieste: update admin/amministrazione/autore/approvatori" ON public.richieste_fido;
CREATE POLICY "Richieste: update admin/amministrazione/direzione/autore"
ON public.richieste_fido
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR created_by = auth.uid()
);
