# Brand e navigazione

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 6. Asset di brand: un solo logo originale

Il logo MADE esiste in tre file base64 (`logo-made-base64.ts`, `logo-made-email-base64.ts`, `logo-made-sidebar-base64.ts`). Nessuna nuova variante va creata a mano o ricostruita da una descrizione: va derivata dal logo ufficiale; se non è chiaro quale sia, chiedere.

## 7. Pulsante "Indietro" nelle schede di dettaglio

Ogni pagina di dettaglio raggiungibile da più punti usa `<BackButton fallbackTo="..." fallbackLabel="..." iconOnly? />` (`src/components/back-button.tsx`), non un link fisso. Limite noto: filtri/scroll in state locale non vengono conservati. Per una nuova pagina, allargare l'unione di tipo `fallbackTo` con il percorso letterale (non `string`). Già applicato a: clienti.$clienteId, lead.$leadId, richieste.$richiestaId, task.$id, articoli.$id, kit.$id, preventivatore.$id, eventi.$eventoId.

## 7-bis. Filtri delle pagine elenco

I filtri delle pagine elenco si conservano con l'hook unico `useFiltriPagina` (`src/hooks/use-filtri-pagina.ts`; sessionStorage per utente e per scheda del browser); non creare meccanismi paralleli. Selezioni, righe espanse, dialog e stati di caricamento non si conservano. Set e date si salvano come array e stringhe AAAA-MM-GG (oggetti e tuple con validazione di forma al ripristino); i link con parametri di filtro nell'URL (es. `?preset=`, `?store=`, `?fascia=` dalla dashboard) partono dai default e il risultato diventa il nuovo stato salvato. Già applicato a: scadenziario, clienti, recupero-crediti, lead, contatti, opportunita, task, richieste, cantieri, piani-rientro, preventivatore, ordini, articoli, legali, assicurazioni, richieste-interne (mie, tutte, gestione, archivio, approva), recupero-agenzia, clienti-variazioni-blocco, fidi-processare.

## 7-ter. Filtri a scelta multipla e selezione su telefono (FM53-FM54)

- I filtri di lista con più valori possibili usano `FiltroMultiplo` (`src/components/filtro-multiplo.tsx`): elenco vuoto = tutti; `"__none__"` = "Senza …" (colonna NULL); più valori in OR; il filtro compare solo a chi lo vedeva, con le stesse opzioni; lo store manager resta fisso sul proprio negozio.
- Su query Supabase si applicano con `filtroElenco` (`src/lib/filtro-elenco.ts`, costante `VALORE_NESSUNO`): mai una copia locale. I filtri fatti in memoria su array restano locali.
- Nelle funzioni del database i parametri di filtro multipli sono array (`uuid[]` / `text[]`), con NULL o elenco vuoto = tutti; i segmenti marketing salvati in formato vecchio (stringa) si leggono con `normalizzaFiltriSegmento` (`src/lib/segmenti-filtri.ts`), gemello SQL `_segmento_filtro_elenco`.
- Filtri salvati con `useFiltriPagina`: gli elenchi si validano con `Array.isArray` (il formato vecchio viene scartato e si riparte dai default).
- Restano a scelta singola: interruttori sì/no/tutti, fasce numeriche, periodi, ordinamenti, stato delle pratiche legali e fascia del Listino vendita (decisioni del proprietario).
- Consensi con più valori scelti: vale "almeno uno".
- Liste con selezione: su telefono `ElencoSchede` riceve `selezioneTutti` ("seleziona tutte"), alimentata dalla stessa funzione dell'intestazione della tabella da PC.
- Semaforo del cliente: fonte unica `fido_teorico_cliente.semaforo_stadio`, mai ricalcolato da fido residuo o scaduto.
