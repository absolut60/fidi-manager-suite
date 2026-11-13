# FM67 — Note con titolo e allegati

## Implementazione
- Migrazione applicata: `drizzle/migrations/0208_fm67_preventivi_note_allegati.sql`.
- `preventivi_note`: titolo rifilato/non vuoto, testo, ordine, autore e date; FK CASCADE, indice e aggiornamento data tramite trigger già esistente.
- Lettura: `public.auth_vede_preventivo_id(_preventivo_id uuid) RETURNS boolean`.
- Scrittura: `public.auth_puo_scrivere_preventivo_id(_preventivo_id uuid) RETURNS boolean`.
- MFA: `public.auth_mfa_ok() RETURNS boolean`. Nessuna nuova funzione di accesso.
- Tre policy restrittive showroom: criterio precedente invariato, con la sola eccezione autorizzata per il preventivo scrivibile.
- Storage: tre policy dedicate SELECT/INSERT/DELETE, ID estratto dal secondo segmento di `preventivo/{id}/...`; controllo MFA anche nelle policy dedicate.
- Note generali e relativi gestori invariati. Note con titolo salvate all’uscita dall’intera riga; modifica in linea, elimina con conferma.
- Testata: Note 62%, Allegati 38% da desktop, impilati su telefono; cornice compatta comune. Allegati tramite `AllegatiSection` e `SchedaAllegato`, anteprima/scarica/elimina, nome/dimensione/autore/data e tipi già ammessi.
- Confermati/ordini: niente comandi di scrittura; anteprima e download restano disponibili.
- Duplica/Stesso cliente/Nuovo cliente/Alternativa: copia titolo, testo e ordine; allegati mai copiati.
- Trasforma in ordine: copia note atomica nella RPC esistente; firma e gate amministratore invariati, nessun cambiamento a selezione/calcoli. Confronto della funzione reale prima/dopo: identica byte per byte rimuovendo le due righe aggiunte.
- Tutte le nuove mutation di note/caricamento/eliminazione allegati del preventivo usano la chiave Salva esistente.

## Verifiche
- `bun test`: 732 pass, 0 fail, 90 file.
- Compilazione automatica: OK.
- Playwright con sessione reale e risposte simulate per documento/note/allegati: aggiunta, modifica, Salva, eliminazione con conferma; finestra upload, anteprima immagine interna; confermato mantiene lettura e nasconde scritture. Screenshot 375/1280; controlli senza overflow a 320/375/390/768/1280/1920. Nessun errore pagina.
- Database reale: tabella/policy/funzione applicate verificate; zero note di prova persistenti.
- **Non verificate end-to-end su dati reali:** RLS amministratore/store_manager/preventivi, upload/download/elimina effettivi, Duplica/Alternativa/Trasforma. La sessione disponibile non soddisfa MFA e la lettura reale PRV-161 restituisce zero righe. Lo strumento SQL non può assumere authenticated né eseguire i gate: nessun ampliamento GRANT/bypass. Serve una sessione di prova valida con secondo fattore per ciascun ruolo.

## File
- `drizzle/migrations/0208_fm67_preventivi_note_allegati.sql` e metadati migrazione gestiti dalla piattaforma.
- `src/integrations/supabase/types.ts` rigenerato dalla piattaforma.
- `src/lib/preventivi-note.ts` (nuovo), `src/lib/preventivi-api.ts`.
- `src/components/preventivatore/NotePreventivo.tsx` (nuovo), `TestataPreventivo.tsx`.
- `src/components/allegati-section.tsx` (opzioni preventivo, altri permessi invariati).
- `tests/preventivi-note.test.ts` (nuovo).
- `src/lib/AGENTS.md`, `roadmap.md`, questa regola e indice.

## Policy create/modificate — SQL verbatim applicato

```sql
CREATE POLICY preventivi_note_select ON public.preventivi_note FOR SELECT TO authenticated USING (public.auth_vede_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_insert ON public.preventivi_note FOR INSERT TO authenticated WITH CHECK (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_update ON public.preventivi_note FOR UPDATE TO authenticated USING (public.auth_puo_scrivere_preventivo_id(preventivo_id)) WITH CHECK (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY preventivi_note_delete ON public.preventivi_note FOR DELETE TO authenticated USING (public.auth_puo_scrivere_preventivo_id(preventivo_id));
CREATE POLICY "Secondo fattore (FM44)" ON public.preventivi_note AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));

CREATE POLICY "Allegati preventivo: lettura" ON public.allegati FOR SELECT TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_vede_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: inserimento" ON public.allegati FOR INSERT TO authenticated WITH CHECK (entita_tipo = 'preventivo' AND cliente_id IS NULL AND caricato_da = auth.uid() AND public.auth_puo_scrivere_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: modifica" ON public.allegati FOR UPDATE TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)) WITH CHECK (entita_tipo = 'preventivo' AND cliente_id IS NULL AND public.auth_puo_scrivere_preventivo_id(entita_id));
CREATE POLICY "Allegati preventivo: eliminazione" ON public.allegati FOR DELETE TO authenticated USING (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id));

ALTER POLICY "Showroom: allegati solo task, chat e lead (ins)" ON public.allegati WITH CHECK (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));
ALTER POLICY "Showroom: allegati solo task, chat e lead (upd)" ON public.allegati USING (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id))) WITH CHECK (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));
ALTER POLICY "Showroom: allegati solo task, chat e lead (del)" ON public.allegati USING (((NOT ( SELECT auth_solo_showroom() AS auth_solo_showroom)) OR (entita_tipo = ANY (ARRAY['task'::text, 'messaggio'::text])) OR ((entita_tipo = 'lead'::text) AND showroom_lead_della_sede(entita_id))) OR (entita_tipo = 'preventivo' AND public.auth_puo_scrivere_preventivo_id(entita_id)));

CREATE POLICY allegati_storage_select_preventivo ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_vede_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));
CREATE POLICY allegati_storage_insert_preventivo ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_puo_scrivere_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));
CREATE POLICY allegati_storage_delete_preventivo ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'allegati' AND split_part(name, '/', 1) = 'preventivo' AND (SELECT public.auth_mfa_ok()) AND public.auth_puo_scrivere_preventivo_id(NULLIF(split_part(name, '/', 2), '')::uuid));

```
