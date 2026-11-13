CREATE TABLE public.preventivi_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preventivo_id uuid NOT NULL REFERENCES public.preventivi(id) ON DELETE CASCADE,
  titolo text NOT NULL CONSTRAINT preventivi_note_titolo_valido CHECK (titolo = btrim(titolo) AND titolo <> ''),
  testo text,
  ordine numeric DEFAULT 0,
  creato_da uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventivi_note TO authenticated;
GRANT ALL ON public.preventivi_note TO service_role;
ALTER TABLE public.preventivi_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY preventivi_note_select ON public.preventivi_note FOR SELECT TO authenticated USING (public.auth_vede_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_insert ON public.preventivi_note FOR INSERT TO authenticated WITH CHECK (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_update ON public.preventivi_note FOR UPDATE TO authenticated USING (public.auth_puo_scrivere_preventivo_id(preventivo_id)) WITH CHECK (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_delete ON public.preventivi_note FOR DELETE TO authenticated USING (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY "Secondo fattore (FM44)" ON public.preventivi_note AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE INDEX preventivi_note_preventivo_id_idx ON public.preventivi_note(preventivo_id);
CREATE TRIGGER preventivi_note_updated_at BEFORE UPDATE ON public.preventivi_note FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
COMMENT ON TABLE public.preventivi_note IS 'FM67: note con titolo, separate dalle note generali del preventivo; accesso tramite i gate esistenti del documento.';

CREATE POLICY "Allegati preventivo: lettura" ON public.allegati FOR SELECT TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_vede_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: inserimento" ON public.allegati FOR INSERT TO authenticated WITH CHECK (entita_tipo = 'preventivo' AND cliente_id IS NULL AND caricato_da = auth.uid() AND public.auth_puo_scrivere_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: modifica" ON public.allegati FOR UPDATE TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)) WITH CHECK (entita_tipo = 'preventivo' AND cliente_id IS NULL AND public.auth_puo_scrivere_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: eliminazione" ON public.allegati FOR DELETE TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id));

ALTER POLICY "Showroom: allegati solo task, chat e lead (ins)" ON public.allegati WITH CHECK (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));
ALTER POLICY "Showroom: allegati solo task, chat e lead (upd)" ON public.allegati USING (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id))) WITH CHECK (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));
ALTER POLICY "Showroom: allegati solo task, chat e lead (del)" ON public.allegati USING (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));

CREATE POLICY allegati_storage_select_preventivo ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_vede_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));
CREATE POLICY allegati_storage_insert_preventivo ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_puo_scrivere_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));
CREATE POLICY allegati_storage_delete_preventivo ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_puo_scrivere_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));

-- Unica aggiunta alla RPC esistente: copia atomica delle note nell'ordine.
-- Firma, gate amministratore, selezione righe e calcoli restano invariati.
DO $migration$
DECLARE
  definizione text := pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure);
  punto text := '  v_ord := 0;';
BEGIN
  IF strpos(definizione, punto) = 0 OR strpos(definizione, 'public.preventivi_note') > 0 THEN
    RAISE EXCEPTION 'Definizione inattesa di trasforma_preventivo_in_ordine: migrazione interrotta';
  END IF;
  EXECUTE replace(definizione, punto, '  INSERT INTO public.preventivi_note (preventivo_id, titolo, testo, ordine)
    SELECT v_ordine_id, titolo, testo, ordine FROM public.preventivi_note WHERE preventivo_id = v_prev.id;
' || punto);
END;
$migration$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) TO authenticated, service_role;