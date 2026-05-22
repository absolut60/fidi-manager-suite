
-- 1. CLIENTI: campi blocco
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS bloccato              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_blocco         text,
  ADD COLUMN IF NOT EXISTS data_blocco           timestamptz,
  ADD COLUMN IF NOT EXISTS bloccato_da           uuid REFERENCES public.profili(id),
  ADD COLUMN IF NOT EXISTS in_gestione_legale    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assicurazione_attiva  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clienti_bloccato ON public.clienti(bloccato);

-- 2. SCADENZE
CREATE TABLE IF NOT EXISTS public.scadenze (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  numero_documento        text,
  sezionale               text,
  data_documento          date,
  data_scadenza           date,
  anno_partita            int,
  importo_scadenza        numeric(12,2) DEFAULT 0,
  importo_documento       numeric(12,2) DEFAULT 0,
  importo_originario      numeric(12,2) DEFAULT 0,
  importo_netto_prev      numeric(12,2) DEFAULT 0,
  importo_ritardo         numeric(12,2) DEFAULT 0,
  stato_contabile         text DEFAULT 'Aperta',
  tipologia_scadenza      text,
  giorni_ritardo          int DEFAULT 0,
  dilazione_teorica       int DEFAULT 0,
  dilazione_effettiva     int DEFAULT 0,
  data_pagamento          date,
  codice_pagamento        text,
  descrizione_pagamento   text,
  cod_blocco              text,
  sollecitato             boolean DEFAULT false,
  in_legale               boolean DEFAULT false,
  fido_euro               numeric(12,2) DEFAULT 0,
  assicurazione           numeric(12,2) DEFAULT 0,
  sede                    int,
  importato_da            uuid REFERENCES public.importazioni(id),
  ultima_sincronizzazione timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scadenze_cliente_id     ON public.scadenze(cliente_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_stato          ON public.scadenze(stato_contabile);
CREATE INDEX IF NOT EXISTS idx_scadenze_data_scadenza  ON public.scadenze(data_scadenza);
CREATE INDEX IF NOT EXISTS idx_scadenze_giorni_ritardo ON public.scadenze(giorni_ritardo);
CREATE INDEX IF NOT EXISTS idx_scadenze_bloccato       ON public.scadenze(cod_blocco);

DROP TRIGGER IF EXISTS trg_scadenze_updated_at ON public.scadenze;
CREATE TRIGGER trg_scadenze_updated_at
  BEFORE UPDATE ON public.scadenze
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. SOLLECITI: tipi
DO $$ BEGIN
  CREATE TYPE public.tipo_sollecito AS ENUM ('interno','email','telefono','raccomandata','avvocato','legale','altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stato_sollecito AS ENUM ('inviato','in_attesa_risposta','risposto','ignorato','risolto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.solleciti (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  scadenza_id     uuid REFERENCES public.scadenze(id) ON DELETE SET NULL,
  tipo            public.tipo_sollecito NOT NULL DEFAULT 'interno',
  stato           public.stato_sollecito NOT NULL DEFAULT 'inviato',
  data_sollecito  date NOT NULL DEFAULT current_date,
  nota            text NOT NULL,
  importo_ref     numeric(12,2),
  risposta        text,
  data_risposta   date,
  inserito_da     uuid REFERENCES public.profili(id),
  reminder_attivo boolean DEFAULT false,
  reminder_data   date,
  reminder_inviato boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_solleciti_cliente_id  ON public.solleciti(cliente_id);
CREATE INDEX IF NOT EXISTS idx_solleciti_scadenza_id ON public.solleciti(scadenza_id);
CREATE INDEX IF NOT EXISTS idx_solleciti_reminder    ON public.solleciti(reminder_data) WHERE reminder_attivo = true AND reminder_inviato = false;

DROP TRIGGER IF EXISTS trg_solleciti_updated_at ON public.solleciti;
CREATE TRIGGER trg_solleciti_updated_at
  BEFORE UPDATE ON public.solleciti
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. PRATICHE LEGALI
DO $$ BEGIN
  CREATE TYPE public.tipo_pratica_legale AS ENUM ('decreto_ingiuntivo','pignoramento','precetto','azione_legale_generica','messa_a_perdita','concordato','fallimento','altro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stato_pratica_legale AS ENUM ('aperta','in_corso','decreto_ottenuto','pignoramento_eseguito','pignoramento_negativo','chiusa_pagamento','chiusa_perdita','sospesa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pratiche_legali (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  tipo                 public.tipo_pratica_legale NOT NULL,
  stato                public.stato_pratica_legale NOT NULL DEFAULT 'aperta',
  data_apertura        date NOT NULL DEFAULT current_date,
  data_chiusura        date,
  importo_contestato   numeric(12,2),
  importo_recuperato   numeric(12,2) DEFAULT 0,
  riferimento_avvocato text,
  studio_legale        text,
  numero_fascicolo     text,
  note                 text,
  esito                text,
  gestita_da           uuid REFERENCES public.profili(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pratiche_legali_cliente_id ON public.pratiche_legali(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pratiche_legali_stato      ON public.pratiche_legali(stato);

DROP TRIGGER IF EXISTS trg_pratiche_legali_updated_at ON public.pratiche_legali;
CREATE TRIGGER trg_pratiche_legali_updated_at
  BEFORE UPDATE ON public.pratiche_legali
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. STORICO PRATICHE
CREATE TABLE IF NOT EXISTS public.storico_pratiche_legali (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pratica_id       uuid NOT NULL REFERENCES public.pratiche_legali(id) ON DELETE CASCADE,
  stato_precedente public.stato_pratica_legale,
  stato_nuovo      public.stato_pratica_legale NOT NULL,
  nota             text,
  modificato_da    uuid REFERENCES public.profili(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_storico_pratiche_pratica_id ON public.storico_pratiche_legali(pratica_id);

-- 6. ASSICURAZIONI
DO $$ BEGIN
  CREATE TYPE public.stato_polizza AS ENUM ('attiva','sospesa','scaduta','sinistro_aperto','sinistro_chiuso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.assicurazioni_credito (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  assicuratore           text NOT NULL,
  numero_polizza         text,
  importo_massimale      numeric(12,2),
  importo_assicurato     numeric(12,2),
  stato                  public.stato_polizza NOT NULL DEFAULT 'attiva',
  data_inizio            date,
  data_scadenza          date,
  sinistro_aperto        boolean DEFAULT false,
  numero_sinistro        text,
  data_apertura_sinistro date,
  importo_sinistro       numeric(12,2),
  note_sinistro          text,
  esito_sinistro         text,
  note                   text,
  gestita_da             uuid REFERENCES public.profili(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assicurazioni_cliente_id ON public.assicurazioni_credito(cliente_id);
CREATE INDEX IF NOT EXISTS idx_assicurazioni_stato      ON public.assicurazioni_credito(stato);

DROP TRIGGER IF EXISTS trg_assicurazioni_updated_at ON public.assicurazioni_credito;
CREATE TRIGGER trg_assicurazioni_updated_at
  BEFORE UPDATE ON public.assicurazioni_credito
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 7. REMINDER
DO $$ BEGIN
  CREATE TYPE public.tipo_reminder AS ENUM ('scadenza_insoluto','sollecito_programmato','revisione_pratica_legale','rinnovo_assicurazione','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.reminder (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          public.tipo_reminder NOT NULL,
  titolo        text NOT NULL,
  descrizione   text,
  cliente_id    uuid REFERENCES public.clienti(id) ON DELETE CASCADE,
  scadenza_id   uuid REFERENCES public.scadenze(id) ON DELETE SET NULL,
  sollecito_id  uuid REFERENCES public.solleciti(id) ON DELETE SET NULL,
  pratica_id    uuid REFERENCES public.pratiche_legali(id) ON DELETE SET NULL,
  utente_id     uuid NOT NULL REFERENCES public.profili(id) ON DELETE CASCADE,
  data_reminder date NOT NULL,
  inviato       boolean DEFAULT false,
  inviato_at    timestamptz,
  letto         boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminder_utente_id  ON public.reminder(utente_id);
CREATE INDEX IF NOT EXISTS idx_reminder_data       ON public.reminder(data_reminder) WHERE inviato = false;
CREATE INDEX IF NOT EXISTS idx_reminder_cliente_id ON public.reminder(cliente_id);

-- 8. VISTA RIEPILOGO
CREATE OR REPLACE VIEW public.riepilogo_insoluti AS
SELECT
  c.id                                          AS cliente_id,
  c.ragione_sociale,
  c.codice_gestionale,
  c.store_id,
  c.bloccato,
  c.in_gestione_legale,
  c.assicurazione_attiva,
  COUNT(s.id) FILTER (WHERE s.stato_contabile = 'Aperta') AS num_scadenze_aperte,
  COALESCE(SUM(s.importo_scadenza) FILTER (WHERE s.stato_contabile = 'Aperta' AND s.importo_scadenza > 0), 0) AS totale_scaduto,
  COALESCE(MAX(s.giorni_ritardo), 0) AS max_giorni_ritardo,
  COALESCE(AVG(s.giorni_ritardo) FILTER (WHERE s.giorni_ritardo > 0), 0)::numeric(8,1) AS media_giorni_ritardo,
  COALESCE(SUM(s.importo_scadenza) FILTER (WHERE s.giorni_ritardo BETWEEN 1 AND 30 AND s.importo_scadenza > 0), 0) AS scaduto_0_30,
  COALESCE(SUM(s.importo_scadenza) FILTER (WHERE s.giorni_ritardo BETWEEN 31 AND 60 AND s.importo_scadenza > 0), 0) AS scaduto_30_60,
  COALESCE(SUM(s.importo_scadenza) FILTER (WHERE s.giorni_ritardo > 60 AND s.importo_scadenza > 0), 0) AS scaduto_oltre_60,
  COUNT(DISTINCT sol.id) AS num_solleciti,
  MAX(sol.data_sollecito) AS ultimo_sollecito,
  COUNT(DISTINCT pl.id) FILTER (WHERE pl.stato NOT IN ('chiusa_pagamento','chiusa_perdita')) AS pratiche_legali_aperte,
  COUNT(DISTINCT ac.id) FILTER (WHERE ac.stato = 'attiva') AS polizze_attive
FROM public.clienti c
LEFT JOIN public.scadenze s ON s.cliente_id = c.id
LEFT JOIN public.solleciti sol ON sol.cliente_id = c.id
LEFT JOIN public.pratiche_legali pl ON pl.cliente_id = c.id
LEFT JOIN public.assicurazioni_credito ac ON ac.cliente_id = c.id
GROUP BY c.id, c.ragione_sociale, c.codice_gestionale, c.store_id, c.bloccato, c.in_gestione_legale, c.assicurazione_attiva;

-- 9. TRIGGER AGGIORNA BLOCCO
CREATE OR REPLACE FUNCTION public.aggiorna_blocco_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
BEGIN
  _cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
  UPDATE public.clienti
  SET bloccato = EXISTS (
        SELECT 1 FROM public.scadenze
        WHERE cliente_id = _cliente_id
          AND cod_blocco = 'BLOCCATO'
          AND stato_contabile = 'Aperta'
      ),
      in_gestione_legale = EXISTS (
        SELECT 1 FROM public.scadenze
        WHERE cliente_id = _cliente_id
          AND in_legale = true
          AND stato_contabile = 'Aperta'
      )
  WHERE id = _cliente_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aggiorna_blocco_cliente ON public.scadenze;
CREATE TRIGGER trg_aggiorna_blocco_cliente
  AFTER INSERT OR UPDATE OR DELETE ON public.scadenze
  FOR EACH ROW EXECUTE FUNCTION public.aggiorna_blocco_cliente();

-- 10. RLS
ALTER TABLE public.scadenze                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solleciti               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pratiche_legali         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storico_pratiche_legali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assicurazioni_credito   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder                ENABLE ROW LEVEL SECURITY;

-- SCADENZE
CREATE POLICY "Scadenze: select come il cliente" ON public.scadenze FOR SELECT TO authenticated
  USING (cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(),'amministratore'::app_role)
       OR has_role(auth.uid(),'approvatore_liv1'::app_role)
       OR has_role(auth.uid(),'approvatore_liv2'::app_role)
       OR has_role(auth.uid(),'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  ));
CREATE POLICY "Scadenze: insert admin/approvatori" ON public.scadenze FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));
CREATE POLICY "Scadenze: update admin/approvatori" ON public.scadenze FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));
CREATE POLICY "Scadenze: delete admin" ON public.scadenze FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role));

-- SOLLECITI
CREATE POLICY "Solleciti: select come il cliente" ON public.solleciti FOR SELECT TO authenticated
  USING (cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(),'amministratore'::app_role)
       OR has_role(auth.uid(),'approvatore_liv1'::app_role)
       OR has_role(auth.uid(),'approvatore_liv2'::app_role)
       OR has_role(auth.uid(),'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  ));
CREATE POLICY "Solleciti: insert admin/approvatori" ON public.solleciti FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));
CREATE POLICY "Solleciti: update admin/approvatori" ON public.solleciti FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));
CREATE POLICY "Solleciti: delete admin" ON public.solleciti FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role));

-- PRATICHE LEGALI: solo admin/approvatori
CREATE POLICY "Pratiche legali: admin/approvatori" ON public.pratiche_legali FOR ALL TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role))
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));

CREATE POLICY "Storico pratiche: admin/approvatori" ON public.storico_pratiche_legali FOR ALL TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role))
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));

-- ASSICURAZIONI
CREATE POLICY "Assicurazioni: admin/approvatori" ON public.assicurazioni_credito FOR ALL TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role))
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));

-- REMINDER
CREATE POLICY "Reminder: utente vede i propri" ON public.reminder FOR SELECT TO authenticated
  USING (utente_id = auth.uid() OR has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY "Reminder: admin/approvatori inseriscono" ON public.reminder FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'approvatore_liv1'::app_role) OR has_role(auth.uid(),'approvatore_liv2'::app_role) OR has_role(auth.uid(),'approvatore_liv3'::app_role));
CREATE POLICY "Reminder: utente aggiorna i propri" ON public.reminder FOR UPDATE TO authenticated
  USING (utente_id = auth.uid() OR has_role(auth.uid(),'amministratore'::app_role));
CREATE POLICY "Reminder: utente elimina i propri" ON public.reminder FOR DELETE TO authenticated
  USING (utente_id = auth.uid() OR has_role(auth.uid(),'amministratore'::app_role));
