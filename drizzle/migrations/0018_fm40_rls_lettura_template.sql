DROP POLICY "Lettura template a tutti gli autenticati" ON public.template_email;
CREATE POLICY "Lettura template: gestori e recupero crediti" ON public.template_email
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'amministrazione'::public.app_role))
    OR (SELECT public.auth_puo_inviare_recupero())
  );

DROP POLICY "Lettura template lettera a tutti gli autenticati" ON public.template_lettera;
CREATE POLICY "Lettura template lettera: gestori e recupero crediti" ON public.template_lettera
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'amministratore'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'direzione'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'amministrazione'::public.app_role))
    OR (SELECT public.auth_puo_inviare_recupero())
  );

COMMENT ON POLICY "Lettura template: gestori e recupero crediti" ON public.template_email IS 'FM40. Leggono i modelli chi li gestisce (stessi ruoli delle policy di scrittura) e chi invia le comunicazioni di recupero (auth_puo_inviare_recupero).';
COMMENT ON POLICY "Lettura template lettera: gestori e recupero crediti" ON public.template_lettera IS 'FM40. Leggono i modelli chi li gestisce (stessi ruoli delle policy di scrittura) e chi invia le comunicazioni di recupero (auth_puo_inviare_recupero).';