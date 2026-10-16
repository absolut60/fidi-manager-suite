-- FM44: protezione campi profilo via trigger (niente autoriferimento nella policy UPDATE di profili).
CREATE OR REPLACE FUNCTION public.profili_blocca_campi_protetti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'amministratore'::public.app_role)
     AND (NEW.store_id IS DISTINCT FROM OLD.store_id
          OR NEW.codice_agente IS DISTINCT FROM OLD.codice_agente
          OR NEW.attivo IS DISTINCT FROM OLD.attivo) THEN
    RAISE EXCEPTION 'Non puoi modificare negozio, codice agente o stato attivo del profilo';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profili_blocca_campi_protetti() IS 'FM44: store_id, codice_agente, attivo del profilo modificabili solo da amministratore o server (auth.uid() NULL). Sostituisce la sottoquery ricorsiva nella policy UPDATE.';

REVOKE EXECUTE ON FUNCTION public.profili_blocca_campi_protetti() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profili_blocca_campi_protetti() TO authenticated, service_role;

DROP TRIGGER IF EXISTS profili_blocca_campi_protetti ON public.profili;
CREATE TRIGGER profili_blocca_campi_protetti
BEFORE UPDATE ON public.profili
FOR EACH ROW EXECUTE FUNCTION public.profili_blocca_campi_protetti();

ALTER POLICY "Utenti aggiornano il proprio profilo" ON public.profili
  USING ((auth.uid() = id) OR (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role)))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role)) OR (auth.uid() = id));

UPDATE public.profili SET password_cambiata_il = now(), deve_cambiare_password = false
WHERE id = 'd4ce46b1-6ea7-4bd3-9023-c7b31e29d264';