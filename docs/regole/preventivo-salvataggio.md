# Salvataggio della scheda preventivo (FM65 punto 3)

- La scheda preventivo è sempre modificabile per chi ha il permesso di scrittura; preventivi confermati e ordini sono in sola lettura. La decisione è solo `preventivoModificabile` (`src/lib/permessi-preventivi.ts`).
- Il salvataggio è automatico all'uscita dalla casella. Il pulsante "Salva" non salva in modo diverso: forza l'uscita dalla casella attiva e attende la fine di tutte le scritture.
- Lo stato di salvataggio ("modifiche" | "salvataggio" | "errore" | "salvato") viene solo da `useStatoSalvataggioPreventivo` (`src/lib/use-stato-salvataggio-preventivo.ts`): badge, pulsante Salva e finestra d'uscita non hanno logiche proprie.
- Ogni nuova scrittura della scheda (useMutation) deve avere `mutationKey: ["salva-preventivo", id]`, altrimenti badge e finestra d'uscita non la vedono.
- La finestra d'uscita ("Modifiche non salvate") compare solo se `devoBloccareUscita(stato)` (modifiche, salvataggio o errore) e solo cambiando pagina: il cambio tab (`?tab=`, stesso pathname) non blocca mai. Chiusura/ricarica del browser usa la finestra generica del browser.
