ALTER TABLE public.richieste_interne
  ADD COLUMN IF NOT EXISTS modalita_pagamento_cod text NULL,
  ADD COLUMN IF NOT EXISTS modalita_pagamento_testo text NULL;
ALTER TABLE public.richieste_interne
  ADD CONSTRAINT richieste_interne_modalita_pagamento_testo_len
  CHECK (modalita_pagamento_testo IS NULL OR char_length(modalita_pagamento_testo) <= 200);
COMMENT ON COLUMN public.richieste_interne.modalita_pagamento_cod IS 'Codice da codici_pagamento.cod (senza FK). NULL se scritto a mano.';
COMMENT ON COLUMN public.richieste_interne.modalita_pagamento_testo IS 'Descrizione del codice al momento della scelta, oppure testo libero (max 200).';