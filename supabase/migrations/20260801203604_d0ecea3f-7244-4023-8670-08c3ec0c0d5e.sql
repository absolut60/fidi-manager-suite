UPDATE public.campagne_sollecito_destinatari
SET stato = 'da_inviare',
    inviato_at = NULL,
    azione_id = NULL,
    errore = '535 Incorrect authentication data (invio fallito, marcato erroneamente come inviato)'
WHERE id = 'a3549efb-f46e-43b1-8e4d-5369de64a0e8';

UPDATE public.campagne_sollecito
SET inviati = GREATEST(COALESCE(inviati, 0) - 1, 0)
WHERE id = 'e77fdecd-cc17-416d-bd91-1829391d3b5a';