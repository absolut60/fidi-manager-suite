CREATE POLICY "Invio comunicazioni recupero: solo recupero crediti (campagne)" ON public.campagne_sollecito
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_puo_inviare_recupero()));

CREATE POLICY "Invio comunicazioni recupero: solo recupero crediti (destinatari)" ON public.campagne_sollecito_destinatari
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.auth_puo_inviare_recupero()));

COMMENT ON POLICY "Invio comunicazioni recupero: solo recupero crediti (campagne)" ON public.campagne_sollecito IS 'FM40 fetta C. Regola unica: auth_puo_inviare_recupero() (gemello TS src/lib/recupero-permessi.ts).';

COMMENT ON POLICY "Invio comunicazioni recupero: solo recupero crediti (destinatari)" ON public.campagne_sollecito_destinatari IS 'FM40 fetta C. Regola unica: auth_puo_inviare_recupero() (gemello TS src/lib/recupero-permessi.ts).';