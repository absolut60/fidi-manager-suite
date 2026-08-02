# Diagnosi — elenco utenti assegnabili nel modulo Lead

## 1. Policy RLS reale su `profili`

Tre policy, tutte su ruolo `authenticated`:

- **SELECT** — "Utenti vedono il proprio profilo"
  `USING ((auth.uid() = id) OR has_role(auth.uid(), 'amministratore'))`
- **INSERT** — "Admin inserisce profili"
  `WITH CHECK (has_role(auth.uid(),'amministratore') OR (auth.uid() = id AND store_id IS NULL))`
- **UPDATE** — "Utenti aggiornano il proprio profilo"
  `USING (auth.uid() = id OR has_role(auth.uid(),'amministratore'))`

**Conclusione: il sospetto è confermato.** In lettura vede tutti i profili solo l'amministratore. Per marketing, amministrazione e direzione (ruoli con accesso ai lead) la query `profili.select("id,nome,cognome")` ritorna **una sola riga: la propria**.

Impatto concreto nel modulo lead:
- `/lead` — il filtro "Assegnatario" contiene solo sé stessi (più "Tutti"/"Non assegnati"), e la colonna "Assegnato a" mostra `—` per ogni lead assegnato a un altro utente (`nomeProfilo` non trova la riga).
- `/lead/$leadId` — stesso problema su selettore e visualizzazione assegnatario.
- Nessun errore visibile: la RLS non lancia, filtra e basta. Bug silenzioso.

## 2. Pattern esistenti nel progetto

Non esiste alcuna RPC o vista dedicata all'elenco utenti: nessuna funzione tipo `get_utenti_assegnabili`, e le uniche funzioni SQL che citano `profili` sono `handle_new_user`, `effective_store_filter`, `user_can_access_cliente`, `user_can_write_cliente`, `user_can_access_richiesta_interna` (tutte security definer, uso interno).

Come fanno le altre parti:

- **`/utenti`** (`src/routes/_app/utenti.tsx`): legge `profili.select("*")` direttamente — funziona solo perché la pagina è riservata agli amministratori.
- **Gestione utenti** (`src/lib/utenti.functions.ts`): server function con `requireSupabaseAuth` + `assertAdmin(userId)` + `supabaseAdmin` (service role, bypassa RLS). È l'unico punto che legge/scrive profili di altri in modo affidabile.
- **Recupero crediti** (`src/routes/_app/recupero-crediti.tsx:240`): filtro "Operatore" popolato leggendo `profili` dal client — **stesso identico bug**, degradato in silenzio (c'è persino un `console.warn` e un `return []` sul fallimento). Non è un pattern da replicare.
- **Richieste fido** (`src/lib/richieste-fido-data.ts`): join embedded `profili!fk(nome,cognome,email)` per richiedente/approvatore — anch'essi soggetti alla RLS, quindi il nome risulta nullo per i non-admin.
- **Richieste interne**: aggira il problema con **denormalizzazione** — colonne testuali `requester_name`, `sede_name`, `archived_by_name` salvate sulla riga; nessuna lettura di `profili` per la lista. Non ha un vero selettore di assegnatario.

## Opzioni di correzione (da decidere, non ancora applicate)

1. **RPC dedicata `get_utenti_assegnabili()`** — `SECURITY DEFINER`, `STABLE`, ritorna `id, nome, cognome` dei soli profili `attivo = true`, con guardia interna sui ruoli abilitati (admin, amministrazione, direzione, marketing, e chi accede ai lead). Nessun dato sensibile esposto oltre al nominativo. Additiva, non tocca le policy esistenti. È l'opzione consigliata: risolve anche il filtro Operatore di recupero crediti e i join dei fidi se in futuro li si vuole allineare.
2. **Nuova policy SELECT su `profili`** che espone nome/cognome a tutti gli autenticati — più semplice ma allarga la visibilità su TUTTE le colonne della tabella (email, store_id, codice_agente): sconsigliata.
3. **Denormalizzazione** del nome assegnatario su `lead` — coerente con richieste interne ma introduce dati che si disallineano nel tempo.

Nessuna modifica applicata: questa è solo la diagnosi richiesta.
