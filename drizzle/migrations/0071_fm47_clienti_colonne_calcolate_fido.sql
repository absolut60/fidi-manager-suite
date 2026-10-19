-- FM47: regole uniche per i filtri lista clienti (prima calcolate nel browser in clienti.tsx).
-- Esposizione oltre il fido: totale_rischio + doc_da_evadere > fido attuale (fido_gestionale); vuoti = 0.
CREATE OR REPLACE FUNCTION public.esposizione_oltre_fido(c public.clienti)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $f$ SELECT COALESCE(c.totale_rischio, 0) + COALESCE(c.doc_da_evadere, 0) > COALESCE(c.fido_gestionale, 0) $f$;

-- Percentuale di fido consumato: (fido attuale − fido residuo) / fido attuale × 100; NULL se fido attuale ≤ 0.
CREATE OR REPLACE FUNCTION public.fido_consumato_perc(c public.clienti)
 RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$ SELECT CASE WHEN COALESCE(c.fido_gestionale, 0) > 0
                   THEN (c.fido_gestionale - COALESCE(c.fido_residuo, 0)) / c.fido_gestionale * 100
              END $f$;

REVOKE EXECUTE ON FUNCTION public.esposizione_oltre_fido(public.clienti) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fido_consumato_perc(public.clienti) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esposizione_oltre_fido(public.clienti) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fido_consumato_perc(public.clienti) TO authenticated;