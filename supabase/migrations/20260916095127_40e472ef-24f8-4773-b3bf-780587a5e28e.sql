-- Backfill anagrafica dei partecipanti collegati a un soggetto esistente (evento 75ef3412)
UPDATE public.eventi_partecipanti p
   SET nome = nullif(btrim(coalesce(r.nome,'')), ''),
       cognome = nullif(btrim(coalesce(r.cognome,'')), ''),
       ragione_sociale = coalesce(p.ragione_sociale, nullif(btrim(coalesce(r.ragione_sociale,'')), '')),
       partita_iva = coalesce(p.partita_iva, nullif(btrim(coalesce(r.partita_iva,'')), '')),
       codice_fiscale = coalesce(p.codice_fiscale, nullif(btrim(coalesce(r.codice_fiscale,'')), '')),
       email = coalesce(p.email, nullif(btrim(coalesce(r.email,'')), '')),
       telefono = coalesce(p.telefono, nullif(btrim(coalesce(r.telefono,'')), '')),
       updated_at = now()
  FROM public.eventi_import_righe r
 WHERE p.evento_id = '75ef3412-bcd8-4f2b-9c31-616919a6ca57'
   AND r.evento_id = p.evento_id
   AND r.stato = 'collegato'
   AND ((r.match_tipo = 'cliente' AND p.cliente_id = r.match_id)
     OR (r.match_tipo = 'lead' AND p.lead_id = r.match_id))
   AND p.nome IS NULL
   AND p.cognome IS NULL;

-- Backfill privacy "azienda del gruppo" per i contatti dei partecipanti da import dell'evento
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT DISTINCT p.contatto_id
      FROM public.eventi_partecipanti p
     WHERE p.evento_id = '75ef3412-bcd8-4f2b-9c31-616919a6ca57'
       AND p.origine = 'import'
       AND p.contatto_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.consensi_log l WHERE l.contatto_id = p.contatto_id
       )
  LOOP
    BEGIN
      PERFORM public.registra_consensi_batch(
        _contatto_id := c.contatto_id,
        _marketing_diretto := false,
        _marketing_media := false,
        _profilazione := false,
        _origine := 'azienda_gruppo',
        _operatore_id := NULL,
        _note := 'Privacy raccolta da azienda del gruppo'
      );
      UPDATE public.contatti
         SET privacy_firmata = true, data_firma = coalesce(data_firma, now())
       WHERE id = c.contatto_id AND privacy_firmata IS DISTINCT FROM true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;