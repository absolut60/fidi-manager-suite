-- Stato richiesta
CREATE TYPE public.stato_richiesta AS ENUM ('bozza','in_approvazione','approvata','rifiutata','annullata');
CREATE TYPE public.esito_approvazione AS ENUM ('approvata','rifiutata');

-- Tabella richieste fido
CREATE TABLE public.richieste_fido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  importo_richiesto numeric(12,2) NOT NULL CHECK (importo_richiesto > 0),
  importo_approvato numeric(12,2),
  durata_mesi integer NOT NULL DEFAULT 12 CHECK (durata_mesi > 0 AND durata_mesi <= 120),
  motivazione text,
  stato public.stato_richiesta NOT NULL DEFAULT 'bozza',
  livello_richiesto integer NOT NULL DEFAULT 1 CHECK (livello_richiesto BETWEEN 1 AND 3),
  livello_corrente integer NOT NULL DEFAULT 1 CHECK (livello_corrente BETWEEN 1 AND 3),
  created_by uuid,
  data_invio timestamptz,
  data_chiusura timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_richieste_cliente ON public.richieste_fido(cliente_id);
CREATE INDEX idx_richieste_store ON public.richieste_fido(store_id);
CREATE INDEX idx_richieste_stato ON public.richieste_fido(stato);

-- Calcolo livello richiesto
CREATE OR REPLACE FUNCTION public.calcola_livello_fido(_importo numeric)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _importo <= 10000 THEN 1
    WHEN _importo <= 50000 THEN 2
    ELSE 3
  END
$$;

-- Trigger imposta livello e date
CREATE OR REPLACE FUNCTION public.richieste_fido_prepare()
RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER trg_richieste_fido_prepare
BEFORE INSERT OR UPDATE ON public.richieste_fido
FOR EACH ROW EXECUTE FUNCTION public.richieste_fido_prepare();

-- Tabella approvazioni
CREATE TABLE public.approvazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  richiesta_id uuid NOT NULL REFERENCES public.richieste_fido(id) ON DELETE CASCADE,
  approvatore_id uuid NOT NULL,
  livello integer NOT NULL CHECK (livello BETWEEN 1 AND 3),
  esito public.esito_approvazione NOT NULL,
  importo_approvato numeric(12,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvazioni_richiesta ON public.approvazioni(richiesta_id);

-- Enable RLS
ALTER TABLE public.richieste_fido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvazioni ENABLE ROW LEVEL SECURITY;

-- Policies richieste_fido
CREATE POLICY "Richieste: visibili admin/approvatori/own store"
ON public.richieste_fido FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
  OR store_id IN (SELECT store_id FROM public.profili WHERE id = auth.uid())
  OR created_by = auth.uid()
);

CREATE POLICY "Richieste: insert autenticati"
ON public.richieste_fido FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

CREATE POLICY "Richieste: update admin o autore in bozza"
ON public.richieste_fido FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR (created_by = auth.uid() AND stato = 'bozza')
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

CREATE POLICY "Richieste: delete solo admin"
ON public.richieste_fido FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'amministratore'::app_role));

-- Policies approvazioni
CREATE POLICY "Approvazioni: select come la richiesta"
ON public.approvazioni FOR SELECT TO authenticated
USING (richiesta_id IN (SELECT id FROM public.richieste_fido));

CREATE POLICY "Approvazioni: insert admin o approvatori"
ON public.approvazioni FOR INSERT TO authenticated
WITH CHECK (
  approvatore_id = auth.uid() AND (
    has_role(auth.uid(), 'amministratore'::app_role)
    OR (livello = 1 AND has_role(auth.uid(), 'approvatore_liv1'::app_role))
    OR (livello = 2 AND has_role(auth.uid(), 'approvatore_liv2'::app_role))
    OR (livello = 3 AND has_role(auth.uid(), 'approvatore_liv3'::app_role))
  )
);

CREATE POLICY "Approvazioni: delete solo admin"
ON public.approvazioni FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'amministratore'::app_role));