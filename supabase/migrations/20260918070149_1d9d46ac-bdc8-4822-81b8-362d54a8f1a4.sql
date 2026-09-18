-- 1) Tabella tassonomia condivisa (mestiere + settore), gerarchica
CREATE TABLE public.categorie_segmento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimensione text NOT NULL CHECK (dimensione IN ('mestiere','settore')),
  codice text NOT NULL,
  label text NOT NULL,
  parent_id uuid NULL REFERENCES public.categorie_segmento(id),
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dimensione, codice)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_segmento TO authenticated;
GRANT ALL ON public.categorie_segmento TO service_role;

ALTER TABLE public.categorie_segmento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorie segmento: tutti autenticati leggono"
  ON public.categorie_segmento FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Categorie segmento: solo admin modifica"
  ON public.categorie_segmento FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));

-- 2) Storico cambi (log immutabile, stesso stile di lead_storico: valori denormalizzati come testo)
CREATE TABLE public.categoria_storico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NULL REFERENCES public.lead(id),
  cliente_id uuid NULL REFERENCES public.clienti(id),
  campo text NOT NULL,
  valore_da text NULL,
  valore_a text NULL,
  operatore_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR cliente_id IS NOT NULL)
);

GRANT SELECT, INSERT ON public.categoria_storico TO authenticated;
GRANT ALL ON public.categoria_storico TO service_role;

ALTER TABLE public.categoria_storico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categoria storico: select per modulo"
  ON public.categoria_storico FOR SELECT
  TO authenticated
  USING (
    (lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
    OR
    (cliente_id IS NOT NULL AND (
      auth_ha_ruolo_globale_clienti()
      OR has_role(auth.uid(), 'marketing'::app_role)
      OR has_role(auth.uid(), 'marketing_eventi'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.clienti c
        WHERE c.id = categoria_storico.cliente_id
          AND user_can_access_cliente(c.id, c.store_id, c.codice_agente)
      )
    ))
  );

CREATE POLICY "Categoria storico: insert per modulo"
  ON public.categoria_storico FOR INSERT
  TO authenticated
  WITH CHECK (
    (lead_id IS NOT NULL AND has_lead_module_access(auth.uid()))
    OR
    (cliente_id IS NOT NULL AND (
      auth_ha_ruolo_globale_clienti()
      OR has_role(auth.uid(), 'marketing'::app_role)
      OR has_role(auth.uid(), 'marketing_eventi'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.clienti c
        WHERE c.id = categoria_storico.cliente_id
          AND user_can_access_cliente(c.id, c.store_id, c.codice_agente)
      )
    ))
  );

-- Nessuna policy UPDATE/DELETE: log immutabile, stesso pattern di lead_storico.

-- 3) Campo mestiere_id, additivo e nullable, su lead e clienti
ALTER TABLE public.lead ADD COLUMN mestiere_id uuid NULL REFERENCES public.categorie_segmento(id);
ALTER TABLE public.clienti ADD COLUMN mestiere_id uuid NULL REFERENCES public.categorie_segmento(id);