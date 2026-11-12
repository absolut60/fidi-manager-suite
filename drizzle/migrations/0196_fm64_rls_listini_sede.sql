ALTER POLICY articoli_gamma_listini_select ON public.articoli_gamma_listini TO authenticated USING (
  (SELECT public.auth_consulta_preventivi())
  AND listino <> 9
  AND EXISTS (SELECT 1 FROM public.auth_listini_sede() s
              WHERE s.globale OR s.listino = articoli_gamma_listini.listino)
);
COMMENT ON POLICY articoli_gamma_listini_select ON public.articoli_gamma_listini IS 'FM64: lettura diretta limitata al listino della sede (e ai depositi della sede); globali (admin, senza sede, sede senza listino) vedono 10/20/30; listino 9 nascosto a tutti. Regola in auth_listini_sede().';

ALTER POLICY prezzi_deposito_gamma_select ON public.prezzi_deposito_gamma TO authenticated USING (
  (SELECT public.auth_consulta_preventivi())
  AND listino <> 9
  AND EXISTS (SELECT 1 FROM public.auth_listini_sede() s
              WHERE s.globale
                 OR (s.listino = prezzi_deposito_gamma.listino
                     AND EXISTS (SELECT 1 FROM public.depositi d
                                 WHERE d.codice = prezzi_deposito_gamma.deposito_codice
                                   AND d.store_id = s.store_id)))
);
COMMENT ON POLICY prezzi_deposito_gamma_select ON public.prezzi_deposito_gamma IS 'FM64: lettura diretta limitata al listino della sede (e ai depositi della sede); globali (admin, senza sede, sede senza listino) vedono 10/20/30; listino 9 nascosto a tutti. Regola in auth_listini_sede().';