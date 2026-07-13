
-- 1) Tabella log invii
CREATE TABLE public.promemoria_scadenza_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  email_destinatario text,
  data_esecuzione date NOT NULL,
  giorni_anticipo int NOT NULL,
  num_scadenze int NOT NULL DEFAULT 0,
  importo_totale numeric DEFAULT 0,
  esito text NOT NULL,
  errore text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promsc_log_cliente ON public.promemoria_scadenza_log(cliente_id);
CREATE INDEX idx_promsc_log_data ON public.promemoria_scadenza_log(data_esecuzione);
CREATE INDEX idx_promsc_log_esito ON public.promemoria_scadenza_log(esito);

GRANT SELECT ON public.promemoria_scadenza_log TO authenticated;
GRANT ALL ON public.promemoria_scadenza_log TO service_role;

ALTER TABLE public.promemoria_scadenza_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Promemoria log: select admin/amministrazione/approvatori"
ON public.promemoria_scadenza_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

-- 2) Tabella ponte log ↔ scadenze
CREATE TABLE public.promemoria_scadenza_log_scadenze (
  log_id uuid NOT NULL REFERENCES public.promemoria_scadenza_log(id) ON DELETE CASCADE,
  scadenza_id uuid NOT NULL REFERENCES public.scadenze(id) ON DELETE CASCADE,
  PRIMARY KEY (log_id, scadenza_id)
);

CREATE INDEX idx_promsc_log_scad_scadenza ON public.promemoria_scadenza_log_scadenze(scadenza_id);

GRANT SELECT ON public.promemoria_scadenza_log_scadenze TO authenticated;
GRANT ALL ON public.promemoria_scadenza_log_scadenze TO service_role;

ALTER TABLE public.promemoria_scadenza_log_scadenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Promemoria log_scad: select eredita log"
ON public.promemoria_scadenza_log_scadenze
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.promemoria_scadenza_log l
    WHERE l.id = promemoria_scadenza_log_scadenze.log_id
      AND (
        has_role(auth.uid(), 'amministratore'::app_role)
        OR has_role(auth.uid(), 'amministrazione'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
        OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
      )
  )
);

-- 3) Colonna idempotenza sulle scadenze
ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS promemoria_scadenza_inviato_il timestamptz NULL;

-- 4) Configurazioni default
INSERT INTO public.configurazioni (chiave, valore) VALUES
  ('promemoria_scadenza_attivo', 'true'),
  ('promemoria_scadenza_giorni_anticipo', '3'),
  ('promemoria_scadenza_metodi', 'BO')
ON CONFLICT (chiave) DO NOTHING;
