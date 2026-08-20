ALTER TABLE public.cantieri
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocodifica_stato text DEFAULT 'da_geocodificare',
  ADD COLUMN IF NOT EXISTS geocodifica_messaggio text,
  ADD COLUMN IF NOT EXISTS geocodificato_il timestamptz,
  ADD COLUMN IF NOT EXISTS agente_codice text,
  ADD COLUMN IF NOT EXISTS categoria text;

CREATE INDEX IF NOT EXISTS idx_cantieri_geocodifica_stato ON public.cantieri (geocodifica_stato);
CREATE INDEX IF NOT EXISTS idx_cantieri_agente_codice ON public.cantieri (agente_codice);
CREATE INDEX IF NOT EXISTS idx_cantieri_attivo ON public.cantieri (attivo);
CREATE INDEX IF NOT EXISTS idx_cantieri_lat_lng ON public.cantieri (lat, lng);

-- RLS: mantiene gli accessi esistenti, esclude l'agente dal ramo "store" e
-- aggiunge il ramo per-agente coerente con public.opportunita
DROP POLICY IF EXISTS "Cantieri: select come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: select come il cliente" ON public.cantieri
FOR SELECT TO authenticated
USING (
  ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (
    cliente_id IN (
      SELECT c.id FROM public.clienti c
      WHERE has_role(auth.uid(), 'amministratore'::app_role)
         OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
         OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
         OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
         OR c.store_id IN (SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid())
    )
    OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
  ))
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role) AND (
      (agente_codice IS NOT NULL AND agente_codice IN (
        SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
      OR cliente_id IN (
        SELECT c.id FROM public.clienti c
        WHERE c.codice_agente IS NOT NULL AND c.codice_agente IN (
          SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
      OR lead_id IN (
        SELECT l.id FROM public.lead l
        WHERE l.agente_codice IS NOT NULL AND l.agente_codice IN (
          SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL))
    )
  )
);

DROP POLICY IF EXISTS "Cantieri: insert come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: insert come il cliente" ON public.cantieri
FOR INSERT TO authenticated
WITH CHECK (
  ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (
    user_can_write_cliente(cliente_id)
    OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
  ))
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND agente_codice IS NOT NULL
    AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Cantieri: update come il cliente" ON public.cantieri;
CREATE POLICY "Cantieri: update come il cliente" ON public.cantieri
FOR UPDATE TO authenticated
USING (
  ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (
    user_can_write_cliente(cliente_id)
    OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
  ))
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND agente_codice IS NOT NULL
    AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
)
WITH CHECK (
  ((NOT has_role(auth.uid(), 'agente'::app_role)) AND (
    user_can_write_cliente(cliente_id)
    OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
  ))
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (
    has_role(auth.uid(), 'agente'::app_role)
    AND agente_codice IS NOT NULL
    AND agente_codice IN (SELECT p.codice_agente FROM public.profili p WHERE p.id = auth.uid() AND p.codice_agente IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Cantieri: delete admin" ON public.cantieri;
CREATE POLICY "Cantieri: delete admin" ON public.cantieri
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'amministrazione'::app_role)
  OR has_role(auth.uid(), 'direzione'::app_role)
  OR (cliente_id IS NULL AND lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cantieri TO authenticated;
GRANT ALL ON public.cantieri TO service_role;