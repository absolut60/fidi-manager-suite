ALTER TABLE public.attivita_fornitore ADD COLUMN IF NOT EXISTS corpo_html text;
COMMENT ON COLUMN public.attivita_fornitore.corpo_html IS 'FM62 G3: corpo HTML sanificato lato server degli invii email; corpo resta il testo semplice.';
DROP POLICY IF EXISTS attivita_fornitore_delete ON public.attivita_fornitore;
CREATE POLICY attivita_fornitore_delete ON public.attivita_fornitore FOR DELETE TO authenticated
  USING (origine IN ('manuale','invio') AND (SELECT public.auth_puo_gestire_fornitori()));