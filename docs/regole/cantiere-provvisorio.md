# Cantiere provvisorio (FM65)

- Un cantiere provvisorio è un **vero cantiere del cliente** (`cantieri`) con `provvisorio = true`; si crea da preventivo con `crea_cantiere_lite(..., _provvisorio => true)` tramite `NuovoCantiereForm`.
- Si **conferma togliendo il segno** con l'interruttore "Provvisorio" nella finestra cantiere (normale aggiornamento, regole di accesso esistenti).
- Si mostra ovunque con `BadgeProvvisorio` (`src/components/badge-provvisorio.tsx`); la pagina Cantieri ha il filtro Tutti / Solo provvisori / Solo confermati (`passaFiltroProvvisorio`).
- **Mai testo libero in `preventivi.cantiere_descrizione`**: la colonna è solo storico, letta come fallback.
- I provvisori sono **esclusi dai conteggi del profilo marketing** (`contaCantieriMarketing`, `src/lib/cantieri-provvisori.ts`).
- Nel preventivo il cantiere collegato si legge con `get_cantiere_preventivo` (anche archiviato), da chi ha accesso ai preventivi.
