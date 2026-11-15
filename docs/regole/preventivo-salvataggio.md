# Salvataggio della scheda preventivo (FM65 punto 3)

- La scheda preventivo è sempre modificabile per chi ha il permesso di scrittura; preventivi confermati e ordini sono in sola lettura. La decisione è solo `preventivoModificabile` (`src/lib/permessi-preventivi.ts`).
- Il salvataggio è automatico all'uscita dalla casella. Il pulsante "Salva" non salva in modo diverso: forza l'uscita dalla casella attiva e attende la fine di tutte le scritture.
- Lo stato di salvataggio ("modifiche" | "salvataggio" | "errore" | "salvato") viene solo da `useStatoSalvataggioPreventivo` (`src/lib/use-stato-salvataggio-preventivo.ts`): badge, pulsante Salva e finestra d'uscita non hanno logiche proprie.
- Ogni nuova scrittura della scheda (useMutation) deve avere `mutationKey: ["salva-preventivo", id]`, altrimenti badge e finestra d'uscita non la vedono.
- La finestra d'uscita ("Modifiche non salvate") compare solo se `devoBloccareUscita(stato)` (modifiche, salvataggio o errore) e solo cambiando pagina: il cambio tab (`?tab=`, stesso pathname) non blocca mai. Chiusura/ricarica del browser usa la finestra generica del browser.

## Numero del preventivo (FM71)
- Preventivi e ordini riusano `contatori_preventivo`, con sequenze annuali distinte per tipo. Il trigger `preventivi_numero_assegnazione` chiama le RPC `prossimo_numero_preventivo` / `prossimo_numero_ordine` già esistenti (UPSERT atomico), formato `PRV-progressivo/aa` / `ORD-progressivo/aa`, anno corrente del database come il precedente percorso. Nessun secondo contatore, nessun backfill.
- Creazione, duplicazione e alternative non inviano numero; `createPreventivo` elimina anche eventuali valori da chiamanti obsoleti. L'anteprima è soltanto informativa e non prenota un numero. Testata in sola lettura per tutti.
- Numeri espliciti in INSERT sono conservati, con l'indice univoco esistente: compatibilità necessaria con la conversione ordine già server-side e con l'app pubblicata precedente. La conversione in ordine resta invariata e assegna con la stessa RPC atomica; nessuna doppia prenotazione.
- `preventivi_numero_immutabile` rifiuta ogni cambio del numero in UPDATE con errore italiano, anche per amministratori; sola eccezione tecnica `service_role`. Numeri già esistenti invariati, nessuna modifica a policy o altri trigger.
- Futuri, NON implementati: sezionale per punto vendita e impostazione «riparti da».

## Assegnazione interna (FM72)

- `preventivi.assegnato_a` è il responsabile interno facoltativo (UUID senza FK); `assegnati_copia` è l'elenco delle copie (UUID[], vuoto per default). L'assegnazione segnala «pronto per te», non autorizza: visibilità e scrittura restano governate dalle RLS e dai gate esistenti.
- Fonte unica delle notifiche: `trg_notifica_assegnazione_preventivo` → `public.notifica_assegnazione_preventivo()`, AFTER INSERT / UPDATE dei due campi. Notifica il nuovo responsabile e le sole copie aggiunte, mai `auth.uid()`; rimozioni, campi invariati e altri aggiornamenti non notificano. Errori isolati con EXCEPTION / RAISE WARNING: il documento si salva comunque.
- `preventivo_assegnato` riusa il raggruppamento canonico FM34 per destinatario e tipo, senza chiave per documento; il catalogo punta a `/preventivatore/` per i gruppi. Notifica singola con numero/titolo (massimo 120 caratteri), link al documento e metadata `preventivo_id`. La voce di catalogo è un inserimento dati separato dalla migrazione strutturale `0226_fm72_assegnazione_preventivi.sql`.
- Prove permanenti in `tests/sql/fm72-assegnazione-preventivi.sql`: impersonazione authenticated aal2, BEGIN/ROLLBACK, destinatari di fixture senza account e nessun dato/contatore persistente.
