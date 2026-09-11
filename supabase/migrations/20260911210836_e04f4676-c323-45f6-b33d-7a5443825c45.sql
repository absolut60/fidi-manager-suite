-- Colonna autore su contatti (per "modifica solo ciò che ha creato")
ALTER TABLE public.contatti
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- Lettura globale clienti: includere il nuovo ruolo.
-- NB: questa funzione governa la SOLA visione globale (SELECT), NON la scrittura
-- (user_can_write_cliente non la usa). Il ruolo ottiene lettura globale senza
-- sbloccare la modifica di massa.
CREATE OR REPLACE FUNCTION public.auth_ha_ruolo_globale_clienti()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN (
        'amministratore','direzione','amministrazione',
        'approvatore_liv1','approvatore_liv2','approvatore_liv3',
        'responsabile_agenti'
      )
  );
$function$;

-- Modulo lead: includere il nuovo ruolo (crea/modifica/invia lead + contatti-lead)
CREATE OR REPLACE FUNCTION public.has_lead_module_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('amministratore','amministrazione','direzione','marketing','responsabile_agenti')
  )
$function$;
