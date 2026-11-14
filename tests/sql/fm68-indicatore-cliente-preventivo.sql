-- Prova da eseguire con un ruolo autorizzato ad assumere authenticated.
-- Sola lettura, claims e ruolo ripristinati con ROLLBACK.
BEGIN;
SELECT c.id AS cliente_fuori_sede FROM public.clienti c
WHERE c.store_id IS DISTINCT FROM (
  SELECT p.store_id FROM public.profili p WHERE p.id='fb7214e8-6774-44f7-98ba-d744255cb027'
) LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"fb7214e8-6774-44f7-98ba-d744255cb027","role":"authenticated","aal":"aal2"}',true);
SELECT * FROM public.indicatore_cliente_preventivo('6b9329ec-9e52-4db9-9100-c250287e8832');
-- UUID senza account/ruoli: la chiamata deve essere rifiutata con 42501.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","aal":"aal2"}',true);
DO $test$
BEGIN
  BEGIN
    PERFORM * FROM public.indicatore_cliente_preventivo('6b9329ec-9e52-4db9-9100-c250287e8832');
    RAISE EXCEPTION 'La RPC ha ammesso un utente senza ruoli';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$test$;
ROLLBACK;