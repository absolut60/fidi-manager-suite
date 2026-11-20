# FM91 — Kit, parametri e regole nella scheda, fetta 2b1

20/11/2026. Nessuna migrazione; preventivi, “Da kit”, kit-legacy, prezzi e lista kit invariati.

## Risultato

- Configurazione nel catalogo: Sistema MADE completo con parametri; Showroom/Edilizia/Fotovoltaico soltanto Base e senza sezione parametri.
- API parametri CRUD/riordino con univocità e messaggi italiani; operandi nel DTO e nelle SELECT componenti. Salvataggi e copia operandi normalizzati dalla fonte unica; duplicazione copia anche i parametri, segnala ogni errore parziale.
- Gestione parametri con numeri italiani e conferma dei riferimenti in caso di rinomina/eliminazione. Le regole non vengono riscritte automaticamente.
- Operandi numerici oppure menu Parametro/Riga; frase leggibile, riferimento per intero, priorità visibile. Anteprima e valori di prova non persistiti, quantità UM1 esclusivamente dal motore canonico, sei decimali senza zeri finali, fonte e messaggi di errore.
- Righe con variante_ruolo interamente in sola lettura con la sola indicazione richiesta; varianti rimandate alla 2b2.
- Gate anagrafiche e linea abilitata identici ai componenti; nessuna variazione RLS. Utenti in lettura vedono dati e possono soltanto provare valori locali, senza comandi di salvataggio.

## Verifiche

- `bun test`: **1211 pass, 0 fail**, 152 file, 3971 asserzioni; guardie AST linee e eliminazioni invariate e verdi.
- 15 test nuovi: frase/etichette, menu Parametro/Riga, normalizzazione dei sei operandi, riferimento parametro in ciascun campo, validazione, configurazione, anteprima identica al motore, duplicazione completa e fallimenti parziali, codice duplicato italiano.
- Playwright a **375, 768, 1280, 1920px**, altezza 1800: overflow orizzontale **0** e nessun errore runtime. Schede su telefono/tablet, tabella desktop; fotografie di pagina, componente completo, finestra parametro, avviso rinomina, sola lettura e solo_base esaminate.
- Flusso con API reali dell'app e risposte intercettate: parametro di prova PASSO 0,6→0,4 modifica montanti 3,383333→5,05 senza scrivere; aggiunta 0,15 modifica immediatamente quantità 5,15 e salva come `0.15`; menu Riga/Parametro produce gli operandi attesi; aggiunta parametro EXTRA_1/2,5, rinomina PASSO con conferma e errore motore, ripristino, frecce ordine, eliminazione verificata, duplicazione con parametri, sola lettura e solo_base.
- Le risposte di prova sono simulate, non dimostrano RLS/auth o scritture reali. Sessione personale non disponibile: `lovable auth-session --json` non trova l'account del richiedente. La pagina temporanea è stata rimossa; nessuna prova è stata salvata nel database.
- Database reale prima/dopo: **3 kit, 33 componenti, 0 parametri**; impronte identiche `095a7c162892b5cdea4776f37f1f5d06` (kit), `e5c5af4d7e9c9bcd86dcecfd303c17c4` (componenti, tutti i campi). Nessun dato creato o cancellato.
- FK verificate dal catalogo reale: componenti, parametri e varianti → kit **ON DELETE CASCADE**. Nessuna cancellazione distruttiva di kit reale per il collaudo.
- Compilazione automatica `build OK`; typecheck autonomo non eseguito per i vincoli della sessione. `git diff --check` pulito.

## File modificati

- `src/lib/linee-preventivo.ts`
- `src/lib/kit-api.ts`
- `src/lib/kit-regole-ui.ts` (nuovo adattatore di presentazione/validazione, nessuna formula di quantità)
- `src/lib/AGENTS.md` (fonte unica e normalizzazione; root saturo non modificato)
- `src/routes/_app/kit.$id.tsx`
- `src/components/kit/ComponenteKit.tsx`
- `src/components/kit/RegolaComponenteKit.tsx` (nuovo)
- `src/components/kit/ParametriKit.tsx` (nuovo)
- `src/components/kit/ProvaParametriKit.tsx` (nuovo)
- `tests/kit-configurazione.test.ts`
- `tests/kit-regole-ui.test.ts` (nuovo)
- `docs/regole/kit.md`
- `docs/verifiche/fm91-kit-2b1.md` e fotografie nella cartella omonima
- `roadmap.md`

Limiti: gestione varianti/import esclusi, autenticazione e salvataggio persistito non verificati; duplicazione e riordino non sono transazioni atomiche e mantengono errori espliciti in caso di esito parziale.