ALTER TABLE public.richieste_fido
  ADD COLUMN IF NOT EXISTS condizione_pagamento_cod text NULL;

COMMENT ON COLUMN public.richieste_fido.condizione_pagamento_cod IS
  'Codice condizione di pagamento scelta in fase di richiesta (lookup verso public.codici_pagamento.cod). Indipendente dalla condizione corrente del cliente.';