
-- ============================================================
-- Tipi enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.stato_importazione AS ENUM (
    'in_elaborazione','completata','completata_con_errori','fallita'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stato_messaggio_wa AS ENUM (
    'in_coda','inviato','consegnato','letto','fallito'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_variazione_fido AS ENUM (
    'nuovo','aumento','diminuzione','rinnovo','sospensione','revoca'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. CANTIERI
-- ============================================================
CREATE TABLE public.cantieri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  indirizzo TEXT,
  cap TEXT,
  citta TEXT,
  provincia TEXT,
  referente TEXT,
  data_inizio DATE,
  data_fine_prevista DATE,
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cantieri_cliente_id ON public.cantieri(cliente_id);
ALTER TABLE public.cantieri ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cantieri: select come il cliente" ON public.cantieri
FOR SELECT TO authenticated USING (
  cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(),'amministratore'::app_role)
       OR has_role(auth.uid(),'approvatore_liv1'::app_role)
       OR has_role(auth.uid(),'approvatore_liv2'::app_role)
       OR has_role(auth.uid(),'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

CREATE POLICY "Cantieri: insert come il cliente" ON public.cantieri
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
FOR UPDATE TO authenticated USING (
  cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(),'amministratore'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

CREATE POLICY "Cantieri: delete admin" ON public.cantieri
FOR DELETE TO authenticated USING (has_role(auth.uid(),'amministratore'::app_role));

CREATE TRIGGER trg_cantieri_updated_at
  BEFORE UPDATE ON public.cantieri
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. STORICO FIDO
-- ============================================================
CREATE TABLE public.storico_fido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  richiesta_id UUID REFERENCES public.richieste_fido(id) ON DELETE SET NULL,
  importo_precedente NUMERIC(12,2),
  importo_nuovo NUMERIC(12,2) NOT NULL,
  tipo_variazione public.tipo_variazione_fido NOT NULL,
  data_inizio_fido DATE,
  data_scadenza_fido DATE,
  eseguito_da UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_storico_fido_cliente_id ON public.storico_fido(cliente_id);
CREATE INDEX idx_storico_fido_richiesta_id ON public.storico_fido(richiesta_id);
ALTER TABLE public.storico_fido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Storico fido: select come il cliente" ON public.storico_fido
FOR SELECT TO authenticated USING (
  cliente_id IN (
    SELECT c.id FROM public.clienti c
    WHERE has_role(auth.uid(),'amministratore'::app_role)
       OR has_role(auth.uid(),'approvatore_liv1'::app_role)
       OR has_role(auth.uid(),'approvatore_liv2'::app_role)
       OR has_role(auth.uid(),'approvatore_liv3'::app_role)
       OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
  )
);

CREATE POLICY "Storico fido: insert autenticati" ON public.storico_fido
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Storico fido: delete admin" ON public.storico_fido
FOR DELETE TO authenticated USING (has_role(auth.uid(),'amministratore'::app_role));

-- ============================================================
-- 3. IMPORTAZIONI
-- ============================================================
CREATE TABLE public.importazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_file TEXT NOT NULL,
  dimensione_bytes BIGINT,
  righe_totali INTEGER,
  righe_elaborate INTEGER DEFAULT 0,
  righe_create INTEGER DEFAULT 0,
  righe_aggiornate INTEGER DEFAULT 0,
  righe_errore INTEGER DEFAULT 0,
  stato public.stato_importazione NOT NULL DEFAULT 'in_elaborazione',
  log_errori JSONB,
  eseguita_da UUID,
  fonte TEXT DEFAULT 'upload_manuale',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completata_at TIMESTAMPTZ
);
ALTER TABLE public.importazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Importazioni: select admin/approvatori" ON public.importazioni
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR has_role(auth.uid(),'approvatore_liv1'::app_role)
  OR has_role(auth.uid(),'approvatore_liv2'::app_role)
  OR has_role(auth.uid(),'approvatore_liv3'::app_role)
);

CREATE POLICY "Importazioni: insert admin/approvatori" ON public.importazioni
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'amministratore'::app_role)
  OR has_role(auth.uid(),'approvatore_liv1'::app_role)
  OR has_role(auth.uid(),'approvatore_liv2'::app_role)
  OR has_role(auth.uid(),'approvatore_liv3'::app_role)
);

CREATE POLICY "Importazioni: update admin/approvatori" ON public.importazioni
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR has_role(auth.uid(),'approvatore_liv1'::app_role)
  OR has_role(auth.uid(),'approvatore_liv2'::app_role)
  OR has_role(auth.uid(),'approvatore_liv3'::app_role)
);

CREATE POLICY "Importazioni: delete admin" ON public.importazioni
FOR DELETE TO authenticated USING (has_role(auth.uid(),'amministratore'::app_role));

-- ============================================================
-- 4. ESPORTAZIONI
-- ============================================================
CREATE TABLE public.esportazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_file TEXT NOT NULL,
  periodo_da DATE,
  periodo_a DATE,
  righe_esportate INTEGER,
  filtro_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  eseguita_da UUID,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.esportazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Esportazioni: select admin/approvatori" ON public.esportazioni
FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'amministratore'::app_role)
  OR has_role(auth.uid(),'approvatore_liv1'::app_role)
  OR has_role(auth.uid(),'approvatore_liv2'::app_role)
  OR has_role(auth.uid(),'approvatore_liv3'::app_role)
);

CREATE POLICY "Esportazioni: insert admin/approvatori" ON public.esportazioni
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'amministratore'::app_role)
  OR has_role(auth.uid(),'approvatore_liv1'::app_role)
  OR has_role(auth.uid(),'approvatore_liv2'::app_role)
  OR has_role(auth.uid(),'approvatore_liv3'::app_role)
);

CREATE POLICY "Esportazioni: delete admin" ON public.esportazioni
FOR DELETE TO authenticated USING (has_role(auth.uid(),'amministratore'::app_role));

-- ============================================================
-- 5. CAMPAGNE WHATSAPP
-- ============================================================
CREATE TABLE public.campagne_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  template_name TEXT NOT NULL,
  messaggio TEXT,
  parametri JSONB,
  totale_invii INTEGER DEFAULT 0,
  invii_ok INTEGER DEFAULT 0,
  invii_falliti INTEGER DEFAULT 0,
  creata_da UUID,
  inviata_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campagne_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campagne WA: solo admin" ON public.campagne_whatsapp
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));

-- ============================================================
-- 6. MESSAGGI WHATSAPP
-- ============================================================
CREATE TABLE public.messaggi_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campagna_id UUID REFERENCES public.campagne_whatsapp(id) ON DELETE SET NULL,
  contatto_id UUID NOT NULL REFERENCES public.contatti(id) ON DELETE CASCADE,
  numero_dest TEXT NOT NULL,
  messaggio TEXT,
  stato public.stato_messaggio_wa NOT NULL DEFAULT 'in_coda',
  meta_message_id TEXT,
  errore TEXT,
  inviato_at TIMESTAMPTZ,
  consegnato_at TIMESTAMPTZ,
  letto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messaggi_wa_contatto ON public.messaggi_whatsapp(contatto_id);
CREATE INDEX idx_messaggi_wa_campagna ON public.messaggi_whatsapp(campagna_id);
CREATE INDEX idx_messaggi_wa_stato ON public.messaggi_whatsapp(stato);
ALTER TABLE public.messaggi_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messaggi WA: solo admin" ON public.messaggi_whatsapp
FOR ALL TO authenticated
USING (has_role(auth.uid(),'amministratore'::app_role))
WITH CHECK (has_role(auth.uid(),'amministratore'::app_role));
