CREATE OR REPLACE FUNCTION public.trg_cancella_iscritto_da_contatto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.iscritti_whatsapp WHERE contatto_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cancella_iscritto_da_contatto ON public.contatti;
CREATE TRIGGER trg_cancella_iscritto_da_contatto
  BEFORE DELETE ON public.contatti
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cancella_iscritto_da_contatto();