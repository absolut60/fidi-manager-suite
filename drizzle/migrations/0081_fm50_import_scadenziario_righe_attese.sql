ALTER TABLE public.importazioni ADD COLUMN IF NOT EXISTS righe_attese integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.importazioni.righe_attese IS 'FM50: righe valide da scrivere (dopo unione doppi e senza clienti inesistenti), sommate per chunk. La pulizia orfani scadenze parte solo se scritte = attese.';

-- Funzione gemella di increment_importazione_counters(6 arg) con _attese.
-- Funzione separata (non nuovo parametro DEFAULT) per evitare ambiguità di overload.
CREATE OR REPLACE FUNCTION public.increment_importazione_counters_attese(
  _id uuid, _elaborate integer, _create integer, _update integer, _error integer,
  _skipped integer DEFAULT 0, _attese integer DEFAULT 0)
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
    righe_elaborate   = COALESCE(i.righe_elaborate, 0)   + COALESCE(_elaborate, 0),
    righe_create      = COALESCE(i.righe_create, 0)      + COALESCE(_create, 0),
    righe_aggiornate  = COALESCE(i.righe_aggiornate, 0)  + COALESCE(_update, 0),
    righe_errore      = COALESCE(i.righe_errore, 0)      + COALESCE(_error, 0),
    righe_saltate     = COALESCE(i.righe_saltate, 0)     + COALESCE(_skipped, 0),
    righe_attese      = COALESCE(i.righe_attese, 0)      + COALESCE(_attese, 0),
    chunks_completati = COALESCE(i.chunks_completati, 0) + 1
  WHERE i.id = _id
  RETURNING i.chunks_completati, i.chunks_totali
  INTO v_chunks_completati, v_chunks_totali;

  chunks_completati := v_chunks_completati;
  chunks_totali := v_chunks_totali;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_importazione_counters_attese(uuid, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_importazione_counters_attese(uuid, integer, integer, integer, integer, integer, integer) TO service_role;