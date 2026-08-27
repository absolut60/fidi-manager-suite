-- 1) Explicit write authorization for realtime broadcast topics
DROP POLICY IF EXISTS "Realtime: insert canali solo membri" ON realtime.messages;
CREATE POLICY "Realtime: insert canali solo membri"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  (realtime.topic() ~~ 'canale:%'
    AND public.is_canale_membro((NULLIF(split_part(realtime.topic(), ':', 2), ''))::uuid, auth.uid()))
  OR realtime.topic() = ('notifiche:' || (auth.uid())::text)
  OR realtime.topic() ~~ (('user:' || (auth.uid())::text) || ':%')
);

-- 2) Harden bootstrap role assignment: never grant admin when an admin already exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_esistenti INT;
  ruolo_assegnato public.app_role;
BEGIN
  INSERT INTO public.profili (id, email, nome, cognome)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'cognome', '')
  );

  SELECT COUNT(*) INTO admin_esistenti
  FROM public.user_roles
  WHERE role = 'amministratore';

  IF admin_esistenti = 0 AND (SELECT COUNT(*) FROM public.profili) <= 1 THEN
    ruolo_assegnato := 'amministratore';
  ELSE
    ruolo_assegnato := 'store_manager';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, ruolo_assegnato);

  RETURN NEW;
END;
$function$;