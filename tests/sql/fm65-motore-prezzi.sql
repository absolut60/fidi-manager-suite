-- FM65 fetta 1: prove del motore prezzi del preventivo (sola lettura).
-- Eseguire come authenticated con claims admin e aal2.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}', true);
WITH casi(n, cliente_codice, codice, atteso) AS (VALUES
  (1, 5003, 'ITA1000108', 4.8000),
  (2, 13380, 'FASL00H003300A0', 3.7503), (2, 13380, 'KAP28861', 23.7000),
  (3, 13142, 'FASL00H003300A0', 3.4586), (3, 13142, 'ITA1000108', 5.0085),
  (4, 13427, 'FASL00H003300A0', 3.4700), (4, 13427, 'ITA1000108', 5.0085),
  (5, 13573, 'FASL00H003300A0', 5.3245), (5, 13573, 'ITA1000108', 5.6350), (5, 13573, 'KAP28861', 27.2550),
  (6, 3173, 'FASL00H003300A0', 4.1670), (6, 3173, 'ITA1000108', 5.5000),
  (7, 2249, 'FASL00H003300A0', 4.6300), (7, 2249, 'ITA1000108', 5.6000),
  (8, 5003, 'NON_ESISTE_FM65', NULL)
)
SELECT c.n, c.cliente_codice, c.codice, c.atteso, r.prezzo_netto AS ottenuto,
       (r.prezzo_netto IS NOT DISTINCT FROM c.atteso) AS ok, r.fonte_prezzo, r.deposito_codice,
       r.prezzo_listino, r.prezzo_base,
       concat_ws('/', r.sc1, r.sc2, r.sc3, r.sc4, r.sc5, r.sc6) AS slot, r.maggiorazione_perc,
       r.regole, r.avvisi
FROM casi c
JOIN public.clienti_condizioni_gamma cg ON cg.cliente_codice = c.cliente_codice
CROSS JOIN LATERAL public.prezzi_preventivo_cliente(cg.cliente_id, ARRAY[c.codice], DATE '2026-11-13') r
ORDER BY c.n, c.codice;
-- 9) richiedente puro cb58438e-6f9c-4602-ae67-170615802a83: atteso errore 42501
-- 10) SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');  -- atteso 0
