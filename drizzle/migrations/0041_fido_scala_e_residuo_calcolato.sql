CREATE OR REPLACE FUNCTION public.arrotonda_fido_proposto(_fido_base numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(_fido_base, 0) <= 0 THEN 0
    WHEN _fido_base <= 1000  THEN CEIL(_fido_base / 500.0)   * 500
    WHEN _fido_base <= 5000  THEN CEIL(_fido_base / 1000.0)  * 1000
    WHEN _fido_base <= 50000 THEN CEIL(_fido_base / 5000.0)  * 5000
    ELSE CEIL(_fido_base / 10000.0) * 10000
  END
$function$;

COMMENT ON FUNCTION public.arrotonda_fido_proposto(numeric) IS 'FONTE UNICA arrotondamento fido proposto, sempre per eccesso: <=1.000 passo 500; <=5.000 passo 1.000; <=50.000 passo 5.000; oltre passo 10.000. Usata anche per l''allineamento all''esposizione in get_fido_teorico.';

CREATE OR REPLACE FUNCTION public.clienti_calcola_fido_residuo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.fido_residuo := COALESCE(NEW.fido_gestionale, 0) - COALESCE(NEW.totale_rischio, 0);
  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.clienti_calcola_fido_residuo() IS 'FONTE UNICA fido residuo: fido_residuo = COALESCE(fido_gestionale,0) - COALESCE(totale_rischio,0), sempre. Nessun import o pagina lo scrive o lo ricalcola.';

DROP TRIGGER IF EXISTS trg_clienti_calcola_fido_residuo ON public.clienti;
CREATE TRIGGER trg_clienti_calcola_fido_residuo
  BEFORE INSERT OR UPDATE OF fido_gestionale, totale_rischio, fido_residuo ON public.clienti
  FOR EACH ROW EXECUTE FUNCTION public.clienti_calcola_fido_residuo();

UPDATE public.clienti
   SET fido_residuo = COALESCE(fido_gestionale,0) - COALESCE(totale_rischio,0)
 WHERE fido_residuo IS DISTINCT FROM COALESCE(fido_gestionale,0) - COALESCE(totale_rischio,0);