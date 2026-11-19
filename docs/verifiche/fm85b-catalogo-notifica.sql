-- Dato di catalogo da eseguire dal proprietario, separato dalla migrazione strutturale.
INSERT INTO public.notifiche_tipi (tipo, raggruppa, chiave_metadata, titolo_gruppo, link_gruppo)
VALUES ('cerved_report_bloccato', true, NULL, '{n} report Cerved non consegnati', '/impostazioni')
ON CONFLICT (tipo) DO NOTHING;