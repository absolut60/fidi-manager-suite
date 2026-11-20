-- Il controllo successivo alla 0251 ha rilevato GRANT anon ereditati dai default del database.
-- Le policy non consentivano comunque accesso anonimo; limitiamo anche i privilegi delle sole tabelle nuove.
REVOKE ALL ON TABLE public.kit_parametri, public.kit_varianti, public.kit_varianti_articoli FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.kit_parametri, public.kit_varianti, public.kit_varianti_articoli FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kit_parametri, public.kit_varianti, public.kit_varianti_articoli TO authenticated;
GRANT ALL ON TABLE public.kit_parametri, public.kit_varianti, public.kit_varianti_articoli TO service_role;