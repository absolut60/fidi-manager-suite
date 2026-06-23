-- Rilassa NOT NULL su codice_gestionale (alcune righe d'import potrebbero non averlo)
ALTER TABLE public.anomalie_import ALTER COLUMN codice_gestionale DROP NOT NULL;

-- Indici utili per consultare le anomalie email del prossimo import
CREATE INDEX IF NOT EXISTS idx_anomalie_import_created_at ON public.anomalie_import(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalie_import_campo ON public.anomalie_import(campo);
CREATE INDEX IF NOT EXISTS idx_anomalie_import_tipo ON public.anomalie_import(tipo_anomalia);