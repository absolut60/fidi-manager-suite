# FM76 — Branding PDF sede del preventivo

- Sede identificata esclusivamente da `preventivi.store_id`, riferimento diretto a `stores`; `filiale` è il nome conservato insieme all'ID da `campiSedePreventivo`. Nessun collegamento per nome e nessuna riserva alla sede cliente. I documenti storici con solo `filiale` restano sul branding precedente.
- Fonte unica `src/lib/branding-pdf.ts`: una lettura della sede e, se presente, un download di `logo_pdf_path` dal bucket privato con il client utente. Dati restituiti fedelmente, senza i valori sostitutivi di `SEDE_FALLBACK`. Lettura o download negati non interrompono la generazione.
- `pdf-export.ts` carica il branding una sola volta prima del disegno in ciascuna delle quattro esportazioni. Il logo PNG è adattato alla larghezza massima 95 mm e altezza utile precedente (20,2 mm ufficiale preventivo/ordine; 13,4 mm altri documenti), preservando le proporzioni native. PNG non leggibile: logo precedente.
- Riga sede sotto il legale fisso con soli campi presenti; numerazione separata. Per rispettare la non regressione esplicita del punto 5, una sede senza `logo_pdf_path`, telefono ed email non aggiunge la riga, anche se possiede nome/indirizzo. Con logo configurato oppure almeno un contatto la riga usa anche gli altri dati presenti. Un errore del download non cancella i dati della sede leggibili.
- Nessuna modifica al blocco legale MADE, alla banda finale, alle colonne, alle righe, ai totali, ai regimi IVA o alla vista commerciale. Nessuna migrazione, policy, aggiornamento dati o modifica alla finestra di generazione.

## Verifiche

970 test verdi (131 file), inclusi sei nuovi test per riferimento sede, ripieghi, download privato, campi mancanti e proporzioni. Compilazione OK.

Generati tutti e quattro i PDF con dati e risposte di prova: confronti raster con la versione precedente identici pixel per pixel sia senza sede sia con sede senza logo/contatti (otto confronti). Logo quadrato e piede sede verificati sui PDF ufficiale e Proposta rapida. Il confronto usa documenti di prova senza righe e non sostituisce un collaudo autenticato su documenti reali.

Il collaudo del download con permessi reali resta aperto: nella sessione precedente nessun logo era configurato e l'account personale non era disponibile. Nessuna modifica a documenti o dati reali.

## File

Nuovi `src/lib/branding-pdf.ts`, `tests/branding-pdf.test.ts`, questo documento; modificati `src/lib/pdf-export.ts`, `src/lib/AGENTS.md`, `roadmap.md`. Decisione del proprietario sulla sede registrata in memoria di progetto.