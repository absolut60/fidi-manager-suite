CREATE INDEX IF NOT EXISTS idx_scadenze_non_pagate_scadute
ON public.scadenze (cliente_id, data_scadenza)
WHERE data_pagamento_effettiva IS NULL;