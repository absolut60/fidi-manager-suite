-- FM65 fetta 2b-1: prove di condizioni_preventivo_cliente (sola lettura, in BEGIN/ROLLBACK).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}', true);
-- Attesi: 13380 → listino 30, Imprese, Categoria A; 13573 → listino 20, Privati, Categoria B
SELECT cg.cliente_codice, r.*
FROM public.clienti_condizioni_gamma cg
CROSS JOIN LATERAL public.condizioni_preventivo_cliente(cg.cliente_id) r
WHERE cg.cliente_codice IN (13380, 13573) ORDER BY 1;
ROLLBACK;
-- Richiedente puro: atteso 42501
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"cb58438e-6f9c-4602-ae67-170615802a83","role":"authenticated","aal":"aal2"}', true);
SELECT * FROM public.condizioni_preventivo_cliente('eb8cd8a7-d64a-4f73-85c9-cc9457d32fcd');
ROLLBACK;
-- Funzioni public eseguibili da anon: atteso 0
SELECT count(*) AS anon_eseguibili FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
