# App sempre in italiano (FM48, 27/10/2026)

Regola di Andrea: **app sempre in italiano**: lang it, niente traduzione automatica, niente controlli nativi con testo del browser, locale it-IT per date, numeri e valute.

- Documento radice (`src/routes/__root.tsx`): `<html lang="it" translate="no">`, `<meta name="google" content="notranslate">`, `<meta http-equiv="content-language" content="it">`.
- Scelta file: mai input file nativo visibile ("Choose file / No file chosen"). Usare `src/components/ui/scegli-file.tsx` (pulsante "Scegli file", testo "Nessun file selezionato" o nome del file). Input nascosti dietro un nostro pulsante sono ammessi.
- Date, numeri, valute: sempre `"it-IT"` in `toLocaleDateString`, `toLocaleString`, `Intl.NumberFormat`, `Intl.DateTimeFormat` (eccezione: `en-CA` solo per produrre date ISO `aaaa-mm-gg` interne). Fonte unica: `formatEuro`/`formatDate` in `src/lib/fidi.ts`.
- Testi visibili, `sr-only` e `aria-label` (anche nei componenti shadcn in `src/components/ui/`) in italiano.

## Allegati (stessa data)

Un allegato si deve poter VEDERE, SCARICARE e CANCELLARE sia prima dell'invio sia dopo il salvataggio. Componenti unici in `src/components/allegati/anteprima-allegato.tsx`:
- `SchedaFileLocale` — file scelto non ancora caricato: anteprima, nome, dimensione, Apri (URL locale revocato allo smontaggio), Rimuovi.
- `SchedaAllegato` con `azioniStandard` — Apri, Scarica, Elimina (solo se permesso); `compatta` per righe senza miniatura grande.
