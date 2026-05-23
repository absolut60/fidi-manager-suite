UPDATE public.importazioni
SET stato = 'completata_con_errori',
    completata_at = now(),
    log_errori = COALESCE(log_errori, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('errore', 'Import interrotto: precedente flusso senza staging chunks', 'cleanup_at', now()))
WHERE stato = 'in_elaborazione'
  AND COALESCE(chunks_totali, 0) = 0;