REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lead_riconciliazioni FROM authenticated;
REVOKE ALL ON public.lead_riconciliazioni FROM anon, PUBLIC;
GRANT SELECT ON public.lead_riconciliazioni TO authenticated;