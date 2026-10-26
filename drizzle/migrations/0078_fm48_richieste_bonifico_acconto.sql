ALTER TABLE public.richieste_interne
  ADD COLUMN acconto_richiesto boolean NOT NULL DEFAULT false,
  ADD COLUMN acconto_importo numeric NULL,
  ADD COLUMN acconto_data_prevista date NULL,
  ADD COLUMN acconto_stato text NULL CHECK (acconto_stato IN ('da_eseguire','eseguito')),
  ADD COLUMN acconto_eseguito_at timestamptz NULL,
  ADD COLUMN acconto_eseguito_da uuid NULL REFERENCES public.profili(id),
  ADD COLUMN acconto_eseguito_da_name text NULL,
  ADD COLUMN acconto_note text NULL,
  ADD COLUMN acconto_promemoria_at timestamptz NULL;

ALTER TABLE public.richieste_interne
  ADD CONSTRAINT richieste_interne_acconto_coerenza CHECK (
    (acconto_richiesto AND acconto_importo IS NOT NULL AND acconto_importo > 0 AND acconto_stato IS NOT NULL)
    OR (NOT acconto_richiesto AND acconto_stato IS NULL)
  );

ALTER TABLE public.richieste_interne_allegati
  ADD COLUMN tipo text NULL CHECK (tipo IN ('cro_bonifico'));

-- Permesso unico tesoreria. Gemello TS: puoGestireTesoreria (src/lib/tesoreria-permessi.ts).
CREATE OR REPLACE FUNCTION public.auth_puo_gestire_tesoreria()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'tesoreria') OR public.has_role(auth.uid(), 'amministratore');
$$;
REVOKE ALL ON FUNCTION public.auth_puo_gestire_tesoreria() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_gestire_tesoreria() TO authenticated;

-- Protezione dei campi di esecuzione del bonifico.
CREATE OR REPLACE FUNCTION public.proteggi_bonifico_acconto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / job
  END IF;
  IF (
       (OLD.acconto_stato IS DISTINCT FROM NEW.acconto_stato
         AND (OLD.acconto_stato = 'eseguito' OR NEW.acconto_stato = 'eseguito'))
       OR OLD.acconto_eseguito_at IS DISTINCT FROM NEW.acconto_eseguito_at
       OR OLD.acconto_eseguito_da IS DISTINCT FROM NEW.acconto_eseguito_da
       OR OLD.acconto_eseguito_da_name IS DISTINCT FROM NEW.acconto_eseguito_da_name
       OR OLD.acconto_note IS DISTINCT FROM NEW.acconto_note
     ) AND NOT public.auth_puo_gestire_tesoreria() THEN
    RAISE EXCEPTION 'Solo la tesoreria può registrare il bonifico';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteggi_bonifico_acconto() FROM PUBLIC, anon;

CREATE TRIGGER trg_richieste_interne_proteggi_bonifico
  BEFORE UPDATE ON public.richieste_interne
  FOR EACH ROW EXECUTE FUNCTION public.proteggi_bonifico_acconto();

-- RPC: registra il bonifico eseguito.
CREATE OR REPLACE FUNCTION public.registra_bonifico_acconto(_richiesta_id uuid, _eseguito_il date, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  _nome text;
BEGIN
  IF NOT public.auth_puo_gestire_tesoreria() THEN
    RAISE EXCEPTION 'Solo la tesoreria può registrare il bonifico';
  END IF;
  SELECT id, acconto_richiesto, status, acconto_stato INTO r
    FROM public.richieste_interne WHERE id = _richiesta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Richiesta non trovata';
  END IF;
  IF NOT r.acconto_richiesto THEN
    RAISE EXCEPTION 'La richiesta non prevede un bonifico di acconto';
  END IF;
  IF r.status NOT IN ('resp_approved','approved') THEN
    RAISE EXCEPTION 'La richiesta non è approvata: il bonifico non si può registrare';
  END IF;
  IF r.acconto_stato IS DISTINCT FROM 'da_eseguire' THEN
    RAISE EXCEPTION 'Il bonifico risulta già eseguito';
  END IF;
  SELECT NULLIF(trim(concat_ws(' ', nome, cognome)), '') INTO _nome
    FROM public.profili WHERE id = auth.uid();
  UPDATE public.richieste_interne SET
    acconto_stato = 'eseguito',
    acconto_eseguito_at = CASE WHEN _eseguito_il IS NULL THEN now()
                               ELSE (_eseguito_il + time '12:00') AT TIME ZONE 'Europe/Rome' END,
    acconto_eseguito_da = auth.uid(),
    acconto_eseguito_da_name = _nome,
    acconto_note = NULLIF(trim(_note), '')
  WHERE id = _richiesta_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registra_bonifico_acconto(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_bonifico_acconto(uuid, date, text) TO authenticated;

-- Visibilità per la tesoreria.
DROP POLICY IF EXISTS richieste_interne_select ON public.richieste_interne;
CREATE POLICY richieste_interne_select ON public.richieste_interne
FOR SELECT TO authenticated
USING (
  (SELECT has_role((SELECT auth.uid()), 'amministratore'::app_role))
  OR (SELECT has_role((SELECT auth.uid()), 'approvatore_richieste_liv1'::app_role))
  OR (SELECT has_role((SELECT auth.uid()), 'approvatore_richieste_liv2'::app_role))
  OR (SELECT has_role((SELECT auth.uid()), 'gestore_richieste'::app_role))
  OR (SELECT has_role((SELECT auth.uid()), 'esecutore_richieste'::app_role))
  OR (SELECT has_role((SELECT auth.uid()), 'tesoreria'::app_role))
  OR ((SELECT has_role((SELECT auth.uid()), 'richiedente'::app_role)) AND requester_id = auth.uid())
  OR ((SELECT has_role((SELECT auth.uid()), 'richiedente'::app_role)) AND sede_id IS NOT NULL
      AND sede_id = (SELECT profili.store_id FROM profili WHERE profili.id = auth.uid()))
);

CREATE OR REPLACE FUNCTION public.user_can_access_richiesta_interna(_richiesta_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'approvatore_richieste_liv1')
    OR public.has_role(auth.uid(), 'approvatore_richieste_liv2')
    OR public.has_role(auth.uid(), 'gestore_richieste')
    OR public.has_role(auth.uid(), 'esecutore_richieste')
    OR public.has_role(auth.uid(), 'tesoreria')
    OR EXISTS (
      SELECT 1 FROM public.richieste_interne r
      WHERE r.id = _richiesta_id
        AND public.has_role(auth.uid(), 'richiedente')
        AND r.requester_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.richieste_interne r
      JOIN public.profili p ON p.id = auth.uid()
      WHERE r.id = _richiesta_id
        AND public.has_role(auth.uid(), 'richiedente')
        AND p.store_id IS NOT NULL
        AND r.sede_id = p.store_id
    )
$function$;