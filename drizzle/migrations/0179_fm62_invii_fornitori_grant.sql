-- FM62 G5: invii_fornitori solo in lettura per gli utenti, nessun accesso anonimo (scritture solo server).
REVOKE ALL ON public.invii_fornitori FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.invii_fornitori FROM authenticated;
GRANT SELECT ON public.invii_fornitori TO authenticated;
GRANT ALL ON public.invii_fornitori TO service_role;