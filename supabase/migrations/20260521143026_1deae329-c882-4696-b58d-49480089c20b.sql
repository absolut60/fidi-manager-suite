-- 1. Tabella configurazioni
CREATE TABLE public.configurazioni (
  chiave text PRIMARY KEY,
  valore text NOT NULL,
  descrizione text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.configurazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Configurazioni: tutti autenticati leggono"
  ON public.configurazioni FOR SELECT TO authenticated USING (true);

CREATE POLICY "Configurazioni: solo admin modifica"
  ON public.configurazioni FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'amministratore'::app_role));

CREATE TRIGGER configurazioni_updated_at
  BEFORE UPDATE ON public.configurazioni
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.configurazioni (chiave, valore, descrizione) VALUES
  ('soglia_livello_1', '10000', 'Importo massimo per livello 1 (€)'),
  ('soglia_livello_2', '50000', 'Importo massimo per livello 2 (€). Oltre serve livello 3.'),
  ('durata_default_mesi', '12', 'Durata di default del fido in mesi'),
  ('reminder_giorni_scadenza', '30', 'Giorni prima della scadenza per inviare reminder');

-- 2. Aggiorna calcola_livello_fido per leggere dalle configurazioni
CREATE OR REPLACE FUNCTION public.calcola_livello_fido(_importo numeric)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  s1 numeric;
  s2 numeric;
BEGIN
  SELECT valore::numeric INTO s1 FROM public.configurazioni WHERE chiave = 'soglia_livello_1';
  SELECT valore::numeric INTO s2 FROM public.configurazioni WHERE chiave = 'soglia_livello_2';
  s1 := COALESCE(s1, 10000);
  s2 := COALESCE(s2, 50000);
  IF _importo <= s1 THEN RETURN 1;
  ELSIF _importo <= s2 THEN RETURN 2;
  ELSE RETURN 3;
  END IF;
END;
$$;

-- 3. data_scadenza su richieste_fido
ALTER TABLE public.richieste_fido
  ADD COLUMN data_scadenza timestamptz;

-- Aggiorna trigger prepare per calcolare data_scadenza in approvazione
CREATE OR REPLACE FUNCTION public.richieste_fido_prepare()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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
  -- Calcola data_scadenza quando la richiesta viene approvata
  IF NEW.stato = 'approvata' AND NEW.data_scadenza IS NULL THEN
    NEW.data_scadenza := COALESCE(NEW.data_chiusura, now()) + (NEW.durata_mesi || ' months')::interval;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Assicura il trigger sia attivo
DROP TRIGGER IF EXISTS richieste_fido_prepare_trg ON public.richieste_fido;
CREATE TRIGGER richieste_fido_prepare_trg
  BEFORE INSERT OR UPDATE ON public.richieste_fido
  FOR EACH ROW EXECUTE FUNCTION public.richieste_fido_prepare();

-- Indice per query scadenze
CREATE INDEX IF NOT EXISTS idx_richieste_fido_data_scadenza
  ON public.richieste_fido (data_scadenza)
  WHERE stato = 'approvata' AND data_scadenza IS NOT NULL;