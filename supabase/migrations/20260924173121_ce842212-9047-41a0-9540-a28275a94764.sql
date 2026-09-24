ALTER TABLE public.richieste_fido DROP CONSTRAINT richieste_fido_importo_richiesto_check;

ALTER TABLE public.richieste_fido ADD CONSTRAINT richieste_fido_importo_richiesto_check
  CHECK (importo_richiesto > 0 OR (importo_richiesto = 0 AND tipo IN ('diminuzione','rinnovo')));