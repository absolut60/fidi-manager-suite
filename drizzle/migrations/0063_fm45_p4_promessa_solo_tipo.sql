CREATE OR REPLACE FUNCTION public.is_promessa_pagamento(_tipo text, _esito text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = 'public'
AS $$ SELECT coalesce(_tipo,'') = 'promessa_pagamento' $$;
COMMENT ON FUNCTION public.is_promessa_pagamento(text, text) IS '_esito ignorato, mantenuto per compatibilità di firma (FM45 P4)';
REVOKE EXECUTE ON FUNCTION public.is_promessa_pagamento(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_promessa_pagamento(text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.azioni_recupero WHERE esito = 'promessa_pagamento') THEN
    RAISE EXCEPTION 'FM45 P4: esistono azioni con esito promessa_pagamento, conversione non eseguita';
  END IF;
END $$;

ALTER TABLE public.azioni_recupero DROP CONSTRAINT azioni_recupero_esito_check;
ALTER TABLE public.azioni_recupero ADD CONSTRAINT azioni_recupero_esito_check
  CHECK (esito = ANY (ARRAY['da_fare','fatto','nessuna_risposta','contestazione','pagato','piano_rientro']));