# Regole di progetto

Queste regole sono parte delle istruzioni permanenti del progetto: valgono quanto il knowledge. In caso di dubbio vale il knowledge, poi questi file.

- `brand-e-navigazione.md` — leggere prima di toccare: logo MADE e sue varianti, pagina di dettaglio con pulsante "Indietro", filtri delle pagine elenco (§7-bis), filtri a scelta multipla e selezione su telefono (§7-ter).
- `tassonomia.md` — leggere prima di toccare: categorie_segmento, Mestiere e Settore su lead, clienti e opportunità, storico categorie.
- `notifiche.md` — leggere prima di toccare: notifiche, raggruppamento nel database, push, schermata e contatore delle notifiche.
- `fonti-uniche.md` — leggere prima di toccare: richiesta fido e decisione, lead ed eventi, import scadenziario e anagrafica, audit clienti, email solleciti, policy RLS, limiti di tempo dei ruoli database (statement_timeout), semaforo di affidabilità e «come paga» (FM58).
- `sicurezza-permessi.md` — leggere prima di toccare: invio comunicazioni di recupero al cliente, fido teorico, porte verso l'esterno, correzioni della scansione Security.
- `responsive.md` — leggere prima di toccare qualsiasi pagina: responsive su ogni larghezza (anche desktop), contenitori, due colonne nei dettagli, card compatte.
- `unita-di-misura.md` — leggere prima di mostrare quantità o prezzi di articoli: UM1/UM2 Gamma, fattore di conversione (quantità ÷, prezzo ×), unità sempre visibile.
- `prezzi-preventivo.md` — leggere prima di toccare prezzi nel preventivo: il prezzo segue il cliente (listino Gamma e sede del cliente), catena Gamma LI01, il TypeScript non ricalcola prezzi e usa `prezzi_preventivo_cliente` (FM65).
- Lettura diretta di articoli_gamma_listini e prezzi_deposito_gamma limitata via RLS alla sede (FM64). Ogni nuova lettura di prezzi per conto di un cliente con listino diverso da quello della sede (es. futuro motore del preventivo) deve passare da una funzione SECURITY DEFINER, mai dalla lettura diretta.
- `lead-riconciliazione.md` — leggere prima di toccare: collegamento lead → cliente, annullamento conversione, riconciliazione dopo import clienti (FM99), divieto di cancellare clienti arrivati da Gamma.
- `lingua-italiana.md` — leggere prima di toccare qualsiasi pagina: app sempre in italiano, niente traduzione automatica, niente controlli nativi con testo del browser, locale it-IT.
- `cantiere-provvisorio.md` — cantieri provvisori: segno, conferma, badge, esclusione dai conteggi marketing.
- `preventivo-salvataggio.md` — leggere prima di toccare la scheda preventivo: sempre modificabile, sola lettura per confermati/ordini, salvataggio automatico e pulsante Salva, chiave comune delle scritture, finestra d'uscita.
- `kit.md` — motore kit unico: livelli linea/famiglia/kit/componenti, incidenza prioritaria, catalogo Gamma e articoli manuali, configurazione per linea e transizione FM90.

- `preventivo-note-allegati.md` — FM67: note con titolo, allegati preventivo, copia e policy verbatim (migrazione 0208); limiti delle verifiche reali documentati.
