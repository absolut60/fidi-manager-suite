-- FM56 L1: allegati sui lead, trasferiti al cliente quando il lead viene collegato.
ALTER TABLE public.allegati DROP CONSTRAINT allegati_entita_tipo_check;
ALTER TABLE public.allegati ADD CONSTRAINT allegati_entita_tipo_check CHECK (entita_tipo = ANY (ARRAY['cliente','assicurazione','pratica_legale','azione_recupero','richiesta_fido','piano_rientro','campagna_email','articolo','kit','preventivo','task','messaggio','lead']::text[]));

ALTER TABLE public.allegati ADD COLUMN IF NOT EXISTS origine_lead_id uuid NULL REFERENCES public.lead(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS allegati_origine_lead_id_idx ON public.allegati (origine_lead_id) WHERE origine_lead_id IS NOT NULL;
COMMENT ON COLUMN public.allegati.origine_lead_id IS 'Lead da cui l''allegato è passato al cliente (FM56 L1).';

-- Helper unici: stessa regola di lead_select / lead_update + showroom della sede.
CREATE OR REPLACE FUNCTION public.auth_puo_vedere_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead l
    WHERE l.id = _lead_id
      AND ( public.has_lead_module_access(auth.uid())
         OR public.has_eventi_flusso_access(auth.uid())
         OR public.agente_vede_record(l.agente_codice, l.created_by, l.cliente_id, NULL::uuid, NULL::uuid)
         OR (public.auth_e_showroom() AND l.store_id IS NOT NULL AND l.store_id = public.profilo_store_id_corrente()))
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_puo_modificare_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead l
    WHERE l.id = _lead_id
      AND ( ( ( public.has_lead_module_access(auth.uid())
             OR public.agente_vede_record(l.agente_codice, l.created_by, l.cliente_id, NULL::uuid, NULL::uuid))
            AND (NOT public.auth_solo_showroom() OR l.store_id = public.profilo_store_id_corrente()))
         OR (public.auth_e_showroom() AND l.store_id IS NOT NULL AND l.store_id = public.profilo_store_id_corrente()))
  )
$$;

REVOKE EXECUTE ON FUNCTION public.auth_puo_vedere_lead(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_puo_modificare_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_puo_vedere_lead(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_puo_modificare_lead(uuid) TO authenticated, service_role;

-- Passaggio al cliente e ritorno al lead (uso interno).
CREATE OR REPLACE FUNCTION public.trasferisci_allegati_lead_a_cliente(_lead_id uuid, _cliente_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF _lead_id IS NULL OR _cliente_id IS NULL THEN RETURN 0; END IF;
  UPDATE public.allegati
     SET entita_tipo = 'cliente', entita_id = _cliente_id, cliente_id = _cliente_id, origine_lead_id = _lead_id
   WHERE entita_tipo = 'lead' AND entita_id = _lead_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.riporta_allegati_al_lead(_lead_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF _lead_id IS NULL THEN RETURN 0; END IF;
  UPDATE public.allegati
     SET entita_tipo = 'lead', entita_id = _lead_id, cliente_id = NULL, origine_lead_id = NULL
   WHERE origine_lead_id = _lead_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.trasferisci_allegati_lead_a_cliente(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.riporta_allegati_al_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trasferisci_allegati_lead_a_cliente(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.riporta_allegati_al_lead(uuid) TO service_role;

-- Un solo punto per tutti i percorsi che valorizzano o azzerano lead.cliente_id.
CREATE OR REPLACE FUNCTION public.trg_lead_allegati_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cliente_id IS NOT DISTINCT FROM OLD.cliente_id THEN RETURN NEW; END IF;
  IF OLD.cliente_id IS NOT NULL THEN
    PERFORM public.riporta_allegati_al_lead(NEW.id);
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    PERFORM public.trasferisci_allegati_lead_a_cliente(NEW.id, NEW.cliente_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_lead_allegati_cliente() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_lead_allegati_cliente
AFTER UPDATE OF cliente_id ON public.lead
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_allegati_cliente();

-- Policy tabella allegati: lead.
CREATE POLICY "Allegati lead: lettura" ON public.allegati FOR SELECT TO authenticated
  USING (entita_tipo = 'lead' AND public.auth_puo_vedere_lead(entita_id));
CREATE POLICY "Allegati lead: inserimento" ON public.allegati FOR INSERT TO authenticated
  WITH CHECK (entita_tipo = 'lead' AND cliente_id IS NULL AND caricato_da = auth.uid() AND public.auth_puo_modificare_lead(entita_id));
CREATE POLICY "Allegati lead: modifica" ON public.allegati FOR UPDATE TO authenticated
  USING (entita_tipo = 'lead' AND public.auth_puo_modificare_lead(entita_id))
  WITH CHECK (entita_tipo = 'lead' AND cliente_id IS NULL AND public.auth_puo_modificare_lead(entita_id));
CREATE POLICY "Allegati lead: eliminazione" ON public.allegati FOR DELETE TO authenticated
  USING (entita_tipo = 'lead' AND public.auth_puo_modificare_lead(entita_id));

-- RESTRICTIVE showroom: task, chat e lead della sede.
DROP POLICY "Showroom: allegati solo task e chat (ins)" ON public.allegati;
DROP POLICY "Showroom: allegati solo task e chat (upd)" ON public.allegati;
DROP POLICY "Showroom: allegati solo task e chat (del)" ON public.allegati;
CREATE POLICY "Showroom: allegati solo task, chat e lead (ins)" ON public.allegati AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((NOT (SELECT public.auth_solo_showroom())) OR entita_tipo = ANY (ARRAY['task','messaggio']) OR (entita_tipo = 'lead' AND public.showroom_lead_della_sede(entita_id)));
CREATE POLICY "Showroom: allegati solo task, chat e lead (upd)" ON public.allegati AS RESTRICTIVE FOR UPDATE TO public
  USING ((NOT (SELECT public.auth_solo_showroom())) OR entita_tipo = ANY (ARRAY['task','messaggio']) OR (entita_tipo = 'lead' AND public.showroom_lead_della_sede(entita_id)))
  WITH CHECK ((NOT (SELECT public.auth_solo_showroom())) OR entita_tipo = ANY (ARRAY['task','messaggio']) OR (entita_tipo = 'lead' AND public.showroom_lead_della_sede(entita_id)));
CREATE POLICY "Showroom: allegati solo task, chat e lead (del)" ON public.allegati AS RESTRICTIVE FOR DELETE TO public
  USING ((NOT (SELECT public.auth_solo_showroom())) OR entita_tipo = ANY (ARRAY['task','messaggio']) OR (entita_tipo = 'lead' AND public.showroom_lead_della_sede(entita_id)));

-- Storage bucket "allegati": file dei lead in lead/{lead_id}/...
CREATE POLICY "allegati_storage_insert_lead" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'allegati' AND owner = auth.uid() AND split_part(name, '/', 1) = 'lead'
              AND public.auth_puo_modificare_lead((NULLIF(split_part(name, '/', 2), ''))::uuid));
CREATE POLICY "allegati_storage_select_lead" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'allegati' AND (
    EXISTS (SELECT 1 FROM public.allegati a WHERE a.storage_path = objects.name AND a.entita_tipo = 'lead' AND public.auth_puo_vedere_lead(a.entita_id))
    OR (split_part(name, '/', 1) = 'lead'
        AND NOT EXISTS (SELECT 1 FROM public.allegati a WHERE a.storage_path = objects.name)
        AND public.auth_puo_modificare_lead((NULLIF(split_part(name, '/', 2), ''))::uuid))));
CREATE POLICY "allegati_storage_delete_lead" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'lead'
         AND NOT EXISTS (SELECT 1 FROM public.allegati a WHERE a.storage_path = objects.name AND a.entita_tipo <> 'lead')
         AND public.auth_puo_modificare_lead((NULLIF(split_part(name, '/', 2), ''))::uuid));
