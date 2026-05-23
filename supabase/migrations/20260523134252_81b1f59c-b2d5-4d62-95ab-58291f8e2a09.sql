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
SET search_path TO 'public'
AS $function$
DECLARE
  v_chunks_completati integer;
  v_chunks_totali integer;
BEGIN
  UPDATE public.importazioni AS i
  SET
    righe_elaborate = COALESCE(i.righe_elaborate, 0) + COALESCE(_elaborate, 0),
    righe_create = COALESCE(i.righe_create, 0) + COALESCE(_create, 0),
    righe_aggiornate = COALESCE(i.righe_aggiornate, 0) + COALESCE(_update, 0),
    righe_errore = COALESCE(i.righe_errore, 0) + COALESCE(_error, 0),
    chunks_completati = COALESCE(i.chunks_completati, 0) + 1
  WHERE i.id = _id
  RETURNING i.chunks_completati, i.chunks_totali
  INTO v_chunks_completati, v_chunks_totali;

  chunks_completati := v_chunks_completati;
  chunks_totali := v_chunks_totali;
  RETURN NEXT;
END;
$function$;