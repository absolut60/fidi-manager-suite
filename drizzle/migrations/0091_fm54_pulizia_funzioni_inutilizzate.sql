DROP FUNCTION IF EXISTS public.get_coerenza_escalation(uuid[], smallint);
DROP FUNCTION IF EXISTS public.fido_proposto(public.clienti);
DROP FUNCTION IF EXISTS public.fido_scostamento(public.clienti);
ALTER FUNCTION public.get_stadio_sollecito_clienti(uuid[]) SET search_path = public;