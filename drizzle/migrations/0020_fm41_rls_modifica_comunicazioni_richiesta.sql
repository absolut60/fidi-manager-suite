DROP POLICY "Comunicazioni: update solo autore" ON public.comunicazioni_richiesta;

CREATE POLICY "Comunicazioni: update solo autore" ON public.comunicazioni_richiesta
  FOR UPDATE TO authenticated
  USING (autore_id = auth.uid() AND public.user_can_access_richiesta_fido(richiesta_id))
  WITH CHECK (autore_id = auth.uid() AND public.user_can_access_richiesta_fido(richiesta_id));

COMMENT ON POLICY "Comunicazioni: update solo autore" ON public.comunicazioni_richiesta IS 'FM41 (09/10/2026). L''autore modifica il proprio messaggio se può vedere la richiesta: fonte unica user_can_access_richiesta_fido(), stessa regola della lettura (migrazione 0019) e della scrittura (RPC invia_comunicazione_richiesta).';