CREATE OR REPLACE FUNCTION public.cliente_privato_fido(partita_iva text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT nullif(btrim(partita_iva, E' \t\n\r\f\v'), '') IS NULL;
$function$;
COMMENT ON FUNCTION public.cliente_privato_fido(text) IS 'Gemello di isPrivatoFido in src/lib/fido-teorico.ts: partita IVA assente, indipendente da tipo soggetto e codice fiscale. Solo perimetro del giro fidi, non calcolo.';
REVOKE EXECUTE ON FUNCTION public.cliente_privato_fido(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_privato_fido(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cliente_privato_fido(public.clienti)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT public.cliente_privato_fido($1.partita_iva);
$function$;
COMMENT ON FUNCTION public.cliente_privato_fido(public.clienti) IS 'Campo calcolato PostgREST: delega al gemello TS/SQL per filtrare il preset prima di paginazione e selezione, senza modificare la tabella clienti.';
REVOKE EXECUTE ON FUNCTION public.cliente_privato_fido(public.clienti) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_privato_fido(public.clienti) TO authenticated, service_role;

-- CREATE OR REPLACE della definizione corrente: cambia SOLO il perimetro comune
-- ai tre tipi di alert. La chiusura fuori_calcolo esistente resta identica.
DO $migration$
DECLARE
  definizione text := pg_get_functiondef('public.aggiorna_alert_fidi()'::regprocedure);
  originale text := 'WHERE v.regola IN (''calcolo'', ''scaduto_non_incassato'');';
  nuovo text := E'WHERE v.regola IN (''calcolo'', ''scaduto_non_incassato'')\n    AND NOT public.cliente_privato_fido(c.partita_iva);';
BEGIN
  IF (length(definizione) - length(replace(definizione, originale, ''))) / length(originale) <> 1 THEN
    RAISE EXCEPTION 'Perimetro aggiorna_alert_fidi non corrispondente: nessuna modifica applicata';
  END IF;
  EXECUTE replace(definizione, originale, nuovo);
END;
$migration$;
REVOKE EXECUTE ON FUNCTION public.aggiorna_alert_fidi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggiorna_alert_fidi() TO authenticated, service_role;