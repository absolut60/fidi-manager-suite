INSERT INTO public.notifiche_tipi (tipo, raggruppa, chiave_metadata, titolo_gruppo, link_gruppo)
VALUES ('iscrizione_whatsapp', false, NULL, '{titolo}', NULL)
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES ('notifica_iscrizioni_whatsapp_destinatari', '485baff2-b930-4947-a868-9e3da3d3a0c9', 'Id utente (separati da virgola) che ricevono la notifica di ogni iscrizione WhatsApp dalla pagina pubblica')
ON CONFLICT (chiave) DO NOTHING;