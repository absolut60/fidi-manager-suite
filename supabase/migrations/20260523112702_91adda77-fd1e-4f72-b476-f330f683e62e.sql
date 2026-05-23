
ALTER TABLE public.importazioni
  ADD COLUMN IF NOT EXISTS chunks_totali integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunks_completati integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_importazione_counters(
  _id uuid,
  _elaborate integer,
  _create integer,
  _update integer,
  _error integer
)
RETURNS TABLE(chunks_completati integer, chunks_totali integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.importazioni
  SET
    righe_elaborate = COALESCE(righe_elaborate, 0) + COALESCE(_elaborate, 0),
    righe_create    = COALESCE(righe_create, 0)    + COALESCE(_create, 0),
    righe_aggiornate = COALESCE(righe_aggiornate, 0) + COALESCE(_update, 0),
    righe_errore    = COALESCE(righe_errore, 0)    + COALESCE(_error, 0),
    chunks_completati = COALESCE(chunks_completati, 0) + 1
  WHERE id = _id
  RETURNING importazioni.chunks_completati, importazioni.chunks_totali
  INTO chunks_completati, chunks_totali;
  RETURN NEXT;
END;
$$;
