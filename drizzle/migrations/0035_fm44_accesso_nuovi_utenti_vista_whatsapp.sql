CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- FM44: nuovi account non attivi e senza ruolo; ruoli e attivazione li imposta solo l'amministratore (creaUtente).
  INSERT INTO public.profili (id, email, nome, cognome, attivo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'cognome', ''),
    false
  );
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.handle_new_user() IS 'FM44: crea il profilo con attivo=false e nessun ruolo. Creazione utenti solo da amministratore.';

ALTER VIEW public.v_whatsapp_opt_in_attuale SET (security_invoker = true);