ALTER TABLE public.righe_preventivo ADD COLUMN codice_famiglia text, ADD COLUMN codice_sottofamiglia text, ADD COLUMN um2 text, ADD COLUMN fattore_conversione numeric;
ALTER TABLE public.kit_componenti ADD COLUMN codice_famiglia text, ADD COLUMN codice_sottofamiglia text, ADD COLUMN um2 text, ADD COLUMN fattore_conversione numeric;
CREATE VIEW public.famiglie_articoli_gamma WITH (security_invoker = true) AS
SELECT DISTINCT codice_famiglia, famiglia, codice_sottofamiglia, sottofamiglia FROM public.articoli_gamma WHERE nullif(btrim(codice_famiglia), '') IS NOT NULL;
GRANT SELECT ON public.famiglie_articoli_gamma TO authenticated, service_role;