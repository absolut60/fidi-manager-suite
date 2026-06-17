
-- Per-user read tracking sulle comunicazioni richiesta fido
ALTER TABLE public.comunicazioni_richiesta
  ADD COLUMN IF NOT EXISTS letto_da uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS comunicazioni_richiesta_letto_da_gin
  ON public.comunicazioni_richiesta USING gin (letto_da);

-- Indice di supporto per query "non lette" per utente
CREATE INDEX IF NOT EXISTS comunicazioni_richiesta_richiesta_id_idx
  ON public.comunicazioni_richiesta (richiesta_id);

-- RPC: segna come lette tutte le comunicazioni di una richiesta per l'utente corrente.
-- L'autore non viene mai considerato destinatario (escluso dal conteggio non letti).
CREATE OR REPLACE FUNCTION public.marca_comunicazioni_lette(_richiesta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  UPDATE public.comunicazioni_richiesta
     SET letto_da = (
       SELECT ARRAY(SELECT DISTINCT u FROM unnest(letto_da || ARRAY[_uid]::uuid[]) AS u)
     )
   WHERE richiesta_id = _richiesta_id
     AND autore_id <> _uid
     AND NOT (_uid = ANY(letto_da));
END;
$$;

GRANT EXECUTE ON FUNCTION public.marca_comunicazioni_lette(uuid) TO authenticated;
