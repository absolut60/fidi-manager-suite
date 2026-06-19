ALTER TABLE public.campagne_sollecito_destinatari
  DROP CONSTRAINT campagne_sollecito_destinatari_azione_id_fkey,
  ADD CONSTRAINT campagne_sollecito_destinatari_azione_id_fkey
    FOREIGN KEY (azione_id) REFERENCES public.azioni_recupero(id) ON DELETE SET NULL;