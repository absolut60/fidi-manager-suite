CREATE INDEX IF NOT EXISTS idx_scadenze_cliente_agg
  ON public.scadenze (cliente_id)
  INCLUDE (importo_scadenza, numero_documento, stato_contabile, data_scadenza, data_pagamento_effettiva, giorni_ritardo);