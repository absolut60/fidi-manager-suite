-- Backfill data_invio for richieste già inviate dove era NULL
UPDATE public.richieste_fido
SET data_invio = COALESCE(data_invio, created_at)
WHERE data_invio IS NULL
  AND stato::text IN ('in_approvazione','in_attesa_liv1','in_attesa_liv2','in_attesa_liv3','integrazioni_richieste','approvata','rifiutata','annullata');

-- Estendi il trigger di preparazione: data_invio va settata appena la richiesta
-- esce dallo stato 'bozza', non solo quando va in 'in_approvazione'.
CREATE OR REPLACE FUNCTION public.richieste_fido_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.livello_richiesto := public.calcola_livello_fido(NEW.importo_richiesto);
  IF TG_OP = 'INSERT' THEN
    NEW.livello_corrente := NEW.livello_richiesto;
  END IF;
  -- data_invio: valorizzata appena la richiesta lascia lo stato 'bozza'
  IF NEW.stato::text <> 'bozza' AND (OLD IS NULL OR OLD.stato::text = 'bozza') THEN
    NEW.data_invio := COALESCE(NEW.data_invio, now());
  END IF;
  IF NEW.stato IN ('approvata','rifiutata','annullata') AND (OLD IS NULL OR OLD.stato NOT IN ('approvata','rifiutata','annullata')) THEN
    NEW.data_chiusura := COALESCE(NEW.data_chiusura, now());
  END IF;
  IF NEW.stato = 'approvata' AND NEW.data_scadenza IS NULL THEN
    NEW.data_scadenza := COALESCE(NEW.data_chiusura, now()) + (NEW.durata_mesi || ' months')::interval;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;