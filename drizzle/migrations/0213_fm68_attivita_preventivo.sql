ALTER TABLE public.attivita_commerciale ADD COLUMN preventivo_id uuid REFERENCES public.preventivi(id) ON DELETE SET NULL;
CREATE INDEX attivita_commerciale_preventivo_id_idx ON public.attivita_commerciale (preventivo_id);

CREATE POLICY "Preventivi: lettura attività del preventivo" ON public.attivita_commerciale AS PERMISSIVE FOR SELECT TO authenticated
USING (preventivo_id IS NOT NULL AND public.auth_vede_preventivo_id(preventivo_id));
CREATE POLICY "Preventivi: inserimento attività del preventivo" ON public.attivita_commerciale AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (preventivo_id IS NOT NULL AND operatore_id = auth.uid() AND public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY "Preventivi: modifica attività del preventivo" ON public.attivita_commerciale AS PERMISSIVE FOR UPDATE TO authenticated
USING (preventivo_id IS NOT NULL AND public.auth_puo_scrivere_preventivo_id(preventivo_id))
WITH CHECK (preventivo_id IS NOT NULL AND public.auth_puo_scrivere_preventivo_id(preventivo_id));