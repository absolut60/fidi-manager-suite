# Linea del preventivo (FM72)

- Il preventivatore resta unico: la linea è un attributo del documento, non un secondo preventivatore.
- Fonte unica di configurazione: `src/lib/linee-preventivo.ts`, catalogo `LINEE_PREVENTIVO`. Etichette, attivazione, colori e ogni futuro comportamento specifico passano dal catalogo; mai confronti diretti con i codici delle linee sparsi nell'app. La guardia AST in `tests/linee-preventivo.test.ts` verifica questa regola.
- Il tipo database contiene Sistema MADE, Showroom, Edilizia e Fotovoltaico. Oggi solo Sistema MADE è attiva: tutti i documenti esistenti sono Sistema MADE. Nuovi codici richiedono una migrazione `ALTER TYPE`; l'attivazione richiede solo configurazione.
- Creazione ordinaria omette la linea e usa il default database; duplicazioni e alternative copiano quella dell'origine attraverso l'opzione interna di `createPreventivo`.
- `BadgeLinea` presenta sempre colore e testo in elenco (incluse alternative), scheda e tab Preventivi del cliente/lead. Il filtro multiplo è conservato da `useFiltriPagina` ma mostrato/applicato solo quando `mostraFiltroLinee` è vero, cioè quando esistono almeno due linee attive.
- Nessuna modifica ai prezzi, ai gate o alle RLS: la visibilità per linea è una tappa futura.
- Migrazione: `0227_fm72_linea_preventivo.sql`. Prova database transazionale: `tests/sql/fm72-linea-preventivo.sql`.