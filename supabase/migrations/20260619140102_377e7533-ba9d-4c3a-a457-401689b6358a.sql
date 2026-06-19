
ALTER TABLE public.allegati DROP CONSTRAINT IF EXISTS allegati_entita_tipo_check;
ALTER TABLE public.allegati ADD CONSTRAINT allegati_entita_tipo_check
  CHECK (entita_tipo = ANY (ARRAY['cliente'::text, 'assicurazione'::text, 'pratica_legale'::text, 'azione_recupero'::text, 'richiesta_fido'::text]));

CREATE OR REPLACE FUNCTION public.allegato_storage_path_cliente_id(_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parts text[];
  entita text;
  eid uuid;
BEGIN
  IF _name IS NULL THEN RETURN NULL; END IF;
  parts := string_to_array(_name, '/');
  IF array_length(parts, 1) < 2 THEN RETURN NULL; END IF;
  entita := parts[1];
  BEGIN
    eid := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF entita = 'cliente' THEN
    RETURN eid;
  ELSIF entita = 'assicurazione' THEN
    RETURN (SELECT cliente_id FROM public.assicurazioni_credito WHERE id = eid);
  ELSIF entita = 'pratica_legale' THEN
    RETURN (SELECT cliente_id FROM public.pratiche_legali WHERE id = eid);
  ELSIF entita = 'azione_recupero' THEN
    RETURN (SELECT cliente_id FROM public.azioni_recupero WHERE id = eid);
  ELSIF entita = 'richiesta_fido' THEN
    RETURN (SELECT cliente_id FROM public.richieste_fido WHERE id = eid);
  END IF;
  RETURN NULL;
END;
$function$;
