-- STORES (punti vendita)
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  citta TEXT,
  indirizzo TEXT,
  telefono TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tutti vedono gli store" ON public.stores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin gestisce stores - insert" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Solo admin gestisce stores - update" ON public.stores
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'amministratore'));

CREATE POLICY "Solo admin gestisce stores - delete" ON public.stores
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'amministratore'));

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- CLIENTI
CREATE TABLE public.clienti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale TEXT NOT NULL,
  partita_iva TEXT,
  codice_fiscale TEXT,
  indirizzo TEXT,
  citta TEXT,
  cap TEXT,
  provincia TEXT,
  telefono TEXT,
  email TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  privacy_firmata BOOLEAN NOT NULL DEFAULT false,
  firma_url TEXT,
  data_firma TIMESTAMPTZ,
  note TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clienti_store ON public.clienti(store_id);
CREATE INDEX idx_clienti_ragione_sociale ON public.clienti(ragione_sociale);

ALTER TABLE public.clienti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e approvatori vedono tutti i clienti" ON public.clienti
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'amministratore')
    OR has_role(auth.uid(), 'approvatore_liv1')
    OR has_role(auth.uid(), 'approvatore_liv2')
    OR has_role(auth.uid(), 'approvatore_liv3')
    OR store_id IN (SELECT store_id FROM public.profili WHERE id = auth.uid())
  );

CREATE POLICY "Autenticati creano clienti" ON public.clienti
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin o store manager aggiornano clienti" ON public.clienti
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'amministratore')
    OR store_id IN (SELECT store_id FROM public.profili WHERE id = auth.uid())
  );

CREATE POLICY "Solo admin elimina clienti" ON public.clienti
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'amministratore'));

CREATE TRIGGER clienti_updated_at BEFORE UPDATE ON public.clienti
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- CONTATTI
CREATE TABLE public.contatti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT,
  ruolo TEXT,
  email TEXT,
  telefono TEXT,
  cellulare TEXT,
  principale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contatti_cliente ON public.contatti(cliente_id);

ALTER TABLE public.contatti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contatti: visibili come il cliente" ON public.contatti
  FOR SELECT TO authenticated USING (
    cliente_id IN (SELECT id FROM public.clienti)
  );

CREATE POLICY "Contatti: insert come il cliente" ON public.contatti
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Contatti: update come il cliente" ON public.contatti
  FOR UPDATE TO authenticated USING (
    cliente_id IN (
      SELECT id FROM public.clienti WHERE
        has_role(auth.uid(), 'amministratore')
        OR store_id IN (SELECT store_id FROM public.profili WHERE id = auth.uid())
    )
  );

CREATE POLICY "Contatti: delete admin" ON public.contatti
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'amministratore'));

CREATE TRIGGER contatti_updated_at BEFORE UPDATE ON public.contatti
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Foreign key profili -> stores
ALTER TABLE public.profili
  ADD CONSTRAINT profili_store_fk FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;