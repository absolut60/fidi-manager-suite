-- FM47: fido proposto e scostamento del precalcolo, come colonne calcolate di clienti (per ordinare la lista).
-- Senza riga in fido_teorico_cliente valgono 0, come oggi nella lista.
CREATE OR REPLACE FUNCTION public.fido_proposto(c public.clienti)
 RETURNS numeric LANGUAGE sql STABLE
AS $f$ SELECT COALESCE((SELECT f.fido_proposto FROM public.fido_teorico_cliente f WHERE f.cliente_id = c.id), 0) $f$;

CREATE OR REPLACE FUNCTION public.fido_scostamento(c public.clienti)
 RETURNS numeric LANGUAGE sql STABLE
AS $f$ SELECT COALESCE((SELECT f.scostamento FROM public.fido_teorico_cliente f WHERE f.cliente_id = c.id), 0) $f$;

REVOKE EXECUTE ON FUNCTION public.fido_proposto(public.clienti) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fido_scostamento(public.clienti) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fido_proposto(public.clienti) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fido_scostamento(public.clienti) TO authenticated;