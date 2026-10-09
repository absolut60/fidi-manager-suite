DROP POLICY "Visibili ai coinvolti nella richiesta" ON public.comunicazioni_richiesta;

CREATE POLICY "Lettura comunicazioni: chi vede la richiesta" ON public.comunicazioni_richiesta
  FOR SELECT TO authenticated
  USING (public.user_can_access_richiesta_fido(richiesta_id));

COMMENT ON POLICY "Lettura comunicazioni: chi vede la richiesta" ON public.comunicazioni_richiesta IS 'FM41 (09/10/2026). Chi può vedere la richiesta fido ne legge i messaggi: fonte unica user_can_access_richiesta_fido(), stessa regola della scrittura (RPC invia_comunicazione_richiesta). Sostituisce la regola precedente che escludeva gli approvatori senza una decisione già registrata.';
