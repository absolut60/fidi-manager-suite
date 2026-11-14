CREATE POLICY "Preventivi: legame solo per chi può scrivere (ins)"
ON public.attivita_commerciale AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (preventivo_id IS NULL OR public.auth_puo_scrivere_preventivo_id(preventivo_id));

CREATE POLICY "Preventivi: legame solo per chi può scrivere (upd)"
ON public.attivita_commerciale AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (preventivo_id IS NULL OR public.auth_puo_scrivere_preventivo_id(preventivo_id));