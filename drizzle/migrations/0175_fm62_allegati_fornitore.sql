-- FM62 G1: allegati per fornitori (e attività fornitore, usate da G2).
ALTER TABLE public.allegati DROP CONSTRAINT allegati_entita_tipo_check;
ALTER TABLE public.allegati ADD CONSTRAINT allegati_entita_tipo_check CHECK (entita_tipo = ANY (ARRAY['cliente'::text, 'assicurazione'::text, 'pratica_legale'::text, 'azione_recupero'::text, 'richiesta_fido'::text, 'piano_rientro'::text, 'campagna_email'::text, 'articolo'::text, 'kit'::text, 'preventivo'::text, 'task'::text, 'messaggio'::text, 'lead'::text, 'fornitore'::text, 'attivita_fornitore'::text]));

CREATE POLICY "Allegati fornitore: lettura" ON public.allegati FOR SELECT TO authenticated
  USING (entita_tipo IN ('fornitore','attivita_fornitore') AND (SELECT public.auth_ha_accesso_fornitori()));
CREATE POLICY "Allegati fornitore: inserimento" ON public.allegati FOR INSERT TO authenticated
  WITH CHECK (entita_tipo IN ('fornitore','attivita_fornitore') AND cliente_id IS NULL AND caricato_da = auth.uid() AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY "Allegati fornitore: modifica" ON public.allegati FOR UPDATE TO authenticated
  USING (entita_tipo IN ('fornitore','attivita_fornitore') AND (SELECT public.auth_puo_gestire_fornitori()))
  WITH CHECK (entita_tipo IN ('fornitore','attivita_fornitore') AND cliente_id IS NULL AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY "Allegati fornitore: eliminazione" ON public.allegati FOR DELETE TO authenticated
  USING (entita_tipo IN ('fornitore','attivita_fornitore') AND (SELECT public.auth_puo_gestire_fornitori()));

CREATE POLICY allegati_storage_select_fornitore ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'allegati' AND split_part(name, '/', 1) IN ('fornitore','attivita_fornitore')
    AND NOT EXISTS (SELECT 1 FROM public.allegati a WHERE a.storage_path = objects.name AND a.entita_tipo NOT IN ('fornitore','attivita_fornitore'))
    AND (SELECT public.auth_ha_accesso_fornitori()));
CREATE POLICY allegati_storage_insert_fornitore ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'allegati' AND owner = auth.uid() AND split_part(name, '/', 1) IN ('fornitore','attivita_fornitore')
    AND (SELECT public.auth_puo_gestire_fornitori()));
CREATE POLICY allegati_storage_delete_fornitore ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'allegati' AND split_part(name, '/', 1) IN ('fornitore','attivita_fornitore')
    AND NOT EXISTS (SELECT 1 FROM public.allegati a WHERE a.storage_path = objects.name AND a.entita_tipo NOT IN ('fornitore','attivita_fornitore'))
    AND (SELECT public.auth_puo_gestire_fornitori()));
