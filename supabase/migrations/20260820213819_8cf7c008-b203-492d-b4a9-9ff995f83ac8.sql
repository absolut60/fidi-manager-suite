-- Verifica che le tabelle siano vuote prima di eliminarle
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.allegati_articolo) > 0 THEN
        RAISE EXCEPTION 'allegati_articolo non è vuota, interruzione';
    END IF;
    IF (SELECT COUNT(*) FROM public.allegati_kit) > 0 THEN
        RAISE EXCEPTION 'allegati_kit non è vuota, interruzione';
    END IF;
END;
$$;

DROP TABLE IF EXISTS public.allegati_articolo;
DROP TABLE IF EXISTS public.allegati_kit;

-- Ricrea la policy SELECT aggiungendo i nuovi tipi solo per amministratore
DROP POLICY IF EXISTS "allegati_select" ON public.allegati;
CREATE POLICY "allegati_select" ON public.allegati
    FOR SELECT
    TO authenticated
    USING (
        has_role(auth.uid(), 'amministratore'::app_role)
        OR ((cliente_id IS NOT NULL) AND user_can_access_cliente(cliente_id))
        OR ((entita_tipo = 'campagna_email'::text) AND (
            has_role(auth.uid(), 'amministrazione'::app_role)
            OR has_role(auth.uid(), 'direzione'::app_role)
            OR has_role(auth.uid(), 'marketing'::app_role)
        ))
        OR (
            entita_tipo IN ('articolo'::text, 'kit'::text, 'preventivo'::text)
            AND has_role(auth.uid(), 'amministratore'::app_role)
        )
    );

-- Ricrea la policy INSERT aggiungendo i nuovi tipi solo per amministratore, preservando caricato_da = auth.uid()
DROP POLICY IF EXISTS "allegati_insert" ON public.allegati;
CREATE POLICY "allegati_insert" ON public.allegati
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (caricato_da = auth.uid())
        AND (
            (
                (entita_tipo = 'campagna_email'::text)
                AND (cliente_id IS NULL)
                AND (
                    has_role(auth.uid(), 'amministratore'::app_role)
                    OR has_role(auth.uid(), 'amministrazione'::app_role)
                    OR has_role(auth.uid(), 'direzione'::app_role)
                    OR has_role(auth.uid(), 'marketing'::app_role)
                )
                AND (EXISTS (
                    SELECT 1 FROM public.campagne_email_marketing c
                    WHERE c.id = allegati.entita_id
                ))
            )
            OR (
                (cliente_id IS NOT NULL)
                AND (
                    has_role(auth.uid(), 'amministratore'::app_role)
                    OR (
                        (entita_tipo = 'assicurazione'::text)
                        AND user_can_access_cliente(cliente_id)
                        AND (
                            has_role(auth.uid(), 'amministrazione'::app_role)
                            OR has_role(auth.uid(), 'approvatore_liv1'::app_role)
                            OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
                            OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
                        )
                    )
                    OR (
                        (entita_tipo = 'pratica_legale'::text)
                        AND user_can_access_cliente(cliente_id)
                        AND (
                            has_role(auth.uid(), 'approvatore_liv1'::app_role)
                            OR has_role(auth.uid(), 'approvatore_liv2'::app_role)
                            OR has_role(auth.uid(), 'approvatore_liv3'::app_role)
                        )
                    )
                    OR (
                        (entita_tipo = ANY (ARRAY['cliente'::text, 'azione_recupero'::text, 'piano_rientro'::text]))
                        AND user_can_access_cliente(cliente_id)
                    )
                    OR (
                        (entita_tipo = 'richiesta_fido'::text)
                        AND user_can_access_richiesta_fido(entita_id)
                    )
                )
            )
            OR (
                entita_tipo IN ('articolo'::text, 'kit'::text, 'preventivo'::text)
                AND has_role(auth.uid(), 'amministratore'::app_role)
            )
        )
    );