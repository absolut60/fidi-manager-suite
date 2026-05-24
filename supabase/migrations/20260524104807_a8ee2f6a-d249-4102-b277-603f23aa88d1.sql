
-- 1a. ultima_importazione_d
ALTER TABLE public.clienti
ADD COLUMN IF NOT EXISTS ultima_importazione_d timestamptz;

-- 1b. dedupe + UNIQUE su note_legali_gestionali
DELETE FROM public.note_legali_gestionali a
USING public.note_legali_gestionali b
WHERE a.created_at < b.created_at
  AND a.cliente_id = b.cliente_id;

ALTER TABLE public.note_legali_gestionali
DROP CONSTRAINT IF EXISTS note_legali_gestionali_cliente_id_unique;

ALTER TABLE public.note_legali_gestionali
ADD CONSTRAINT note_legali_gestionali_cliente_id_unique UNIQUE (cliente_id);

-- 1c. anomalie_import
CREATE TABLE IF NOT EXISTS public.anomalie_import (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  importazione_id uuid REFERENCES public.importazioni(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE CASCADE,
  codice_gestionale text NOT NULL,
  ragione_sociale text,
  tipo_anomalia text NOT NULL,
  campo text NOT NULL,
  valore_attuale text,
  valore_nuovo text,
  stato text NOT NULL DEFAULT 'in_attesa',
  gestita_da uuid REFERENCES public.profili(id),
  gestita_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalie_import_stato ON public.anomalie_import(stato);
CREATE INDEX IF NOT EXISTS idx_anomalie_import_importazione ON public.anomalie_import(importazione_id);
CREATE INDEX IF NOT EXISTS idx_anomalie_import_cliente ON public.anomalie_import(cliente_id);

ALTER TABLE public.anomalie_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anomalie: select admin/approvatori"
ON public.anomalie_import FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

CREATE POLICY "Anomalie: insert admin/approvatori"
ON public.anomalie_import FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

CREATE POLICY "Anomalie: update admin/approvatori"
ON public.anomalie_import FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'amministratore'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
  OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
);

CREATE POLICY "Anomalie: delete admin"
ON public.anomalie_import FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'amministratore'::app_role));
