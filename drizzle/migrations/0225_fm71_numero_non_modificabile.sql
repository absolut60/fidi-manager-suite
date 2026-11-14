CREATE OR REPLACE FUNCTION public.preventivi_assegna_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_anno integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_progressivo integer;
BEGIN
  -- Numeri espliciti conservati per compatibilità con la conversione ordine
  -- già server-side e con l'app pubblicata prima del rilascio; UNIQUE resta attivo.
  IF NEW.numero IS NULL OR btrim(NEW.numero) = '' THEN
    IF NEW.tipo = 'ordine'::public.tipo_documento THEN
      v_progressivo := public.prossimo_numero_ordine(v_anno);
      NEW.numero := 'ORD-' || v_progressivo::text || '/' || lpad((v_anno % 100)::text, 2, '0');
    ELSE
      v_progressivo := public.prossimo_numero_preventivo(v_anno);
      NEW.numero := 'PRV-' || v_progressivo::text || '/' || lpad((v_anno % 100)::text, 2, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.preventivi_assegna_numero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preventivi_assegna_numero() TO authenticated, service_role;

CREATE TRIGGER preventivi_numero_assegnazione
BEFORE INSERT ON public.preventivi
FOR EACH ROW EXECUTE FUNCTION public.preventivi_assegna_numero();

CREATE OR REPLACE FUNCTION public.preventivi_blocca_modifica_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.numero IS DISTINCT FROM OLD.numero
     AND current_user <> 'service_role'
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Il numero del documento è assegnato dal database e non può essere modificato.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.preventivi_blocca_modifica_numero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preventivi_blocca_modifica_numero() TO authenticated, service_role;

CREATE TRIGGER preventivi_numero_immutabile
BEFORE UPDATE OF numero ON public.preventivi
FOR EACH ROW EXECUTE FUNCTION public.preventivi_blocca_modifica_numero();