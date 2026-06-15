
-- Helper: deriva il cliente_id dal path di un allegato nel bucket "allegati"
-- Path attesi: {entita_tipo}/{entita_id}/...
CREATE OR REPLACE FUNCTION public.allegato_storage_path_cliente_id(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  END IF;
  RETURN NULL;
END;
$$;

-- Storage INSERT: oltre a owner=auth.uid(), richiedi che il path appartenga a un cliente accessibile
DROP POLICY IF EXISTS allegati_storage_insert ON storage.objects;
CREATE POLICY allegati_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'allegati'
    AND owner = auth.uid()
    AND public.user_can_access_cliente(public.allegato_storage_path_cliente_id(name))
  );

-- Reminder UPDATE: consenti promemoria personali (cliente_id NULL) e verifica accesso quando cliente_id è valorizzato
DROP POLICY IF EXISTS "Reminder: utente aggiorna i propri" ON public.reminder;
CREATE POLICY "Reminder: utente aggiorna i propri" ON public.reminder
  FOR UPDATE TO authenticated
  USING (
    utente_id = auth.uid() OR has_role(auth.uid(), 'amministratore'::app_role)
  )
  WITH CHECK (
    (utente_id = auth.uid() OR has_role(auth.uid(), 'amministratore'::app_role))
    AND (cliente_id IS NULL OR user_can_access_cliente(cliente_id))
  );
