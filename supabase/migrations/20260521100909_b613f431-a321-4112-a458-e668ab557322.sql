CREATE OR REPLACE FUNCTION public.calcola_livello_fido(_importo numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _importo <= 10000 THEN 1
    WHEN _importo <= 50000 THEN 2
    ELSE 3
  END
$$;

CREATE OR REPLACE FUNCTION public.richieste_fido_prepare()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.livello_richiesto := public.calcola_livello_fido(NEW.importo_richiesto);
  IF TG_OP = 'INSERT' THEN
    NEW.livello_corrente := NEW.livello_richiesto;
  END IF;
  IF NEW.stato = 'in_approvazione' AND (OLD IS NULL OR OLD.stato <> 'in_approvazione') THEN
    NEW.data_invio := COALESCE(NEW.data_invio, now());
  END IF;
  IF NEW.stato IN ('approvata','rifiutata','annullata') AND (OLD IS NULL OR OLD.stato NOT IN ('approvata','rifiutata','annullata')) THEN
    NEW.data_chiusura := COALESCE(NEW.data_chiusura, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;