
# Stadio escalation sollecito + check coerenza pre-invio

## 1. Derivazione `livello_sollecito` (rispondo al "dimmi come lo ricavi")

`azioni_recupero` oggi NON ha `template_id`. Aggiungo:

- Colonna `livello_sollecito smallint NULL` su `azioni_recupero` (0..3, dove 1=sollecito_1, 2=sollecito_2, 3=messa_in_mora, NULL=non pertinente, es. telefonate/note/promemoria).
- Valorizzato all'invio (singolo + massivo) leggendo `template_email.tipo` del template usato:
  - `sollecito_1` → 1
  - `sollecito_2` → 2
  - `messa_in_mora` → 3
  - `promemoria_scadenza` → NULL (esplicitamente escluso: lo stadio escalation NON deve mai includere i promemoria cortesia).

### Backfill retroattivo (limite)

Non avendo template_id storico, faccio un best-effort matching sul testo di `azioni_recupero.email_oggetto` rimuovendo i placeholder dai template e confrontando il prefisso fisso:

- "Sollecito di pagamento" → livello 1
- "Secondo sollecito" → livello 2
- "Costituzione in mora" → livello 3
- "Promemoria" → NULL

Limite: se in futuro vengono modificati gli oggetti dei template, il match retroattivo potrebbe non coprire azioni vecchie inviate con oggetti diversi. Per le nuove azioni, invece, il campo viene valorizzato in modo deterministico al momento dell'invio.

## 2. Migration

```sql
ALTER TABLE public.azioni_recupero
  ADD COLUMN livello_sollecito smallint NULL
    CHECK (livello_sollecito IS NULL OR livello_sollecito BETWEEN 0 AND 3);

CREATE INDEX idx_azioni_recupero_livello
  ON public.azioni_recupero (cliente_id, livello_sollecito)
  WHERE livello_sollecito IS NOT NULL;

-- Backfill best-effort dalle email gia inviate
UPDATE public.azioni_recupero
SET livello_sollecito = CASE
  WHEN email_oggetto ILIKE 'Costituzione in mora%' THEN 3
  WHEN email_oggetto ILIKE 'Secondo sollecito%'    THEN 2
  WHEN email_oggetto ILIKE 'Sollecito di pagamento%' THEN 1
  ELSE NULL
END
WHERE tipo = 'email' AND livello_sollecito IS NULL;
```

Poi sostituisco/affianco la RPC aggregato per restituire anche lo stadio:

```sql
CREATE OR REPLACE FUNCTION public.get_recupero_clienti_aggregato_v2(...)
RETURNS TABLE (
  -- tutti i campi attuali +
  stadio_sollecito smallint,           -- 0 mai, 1..3
  stadio_data timestamptz,             -- data ultima email del livello max
  stadio_giorni int                    -- oggi - stadio_data
)
```

Lo `stadio` di un cliente è il `MAX(livello_sollecito)` tra le azioni email collegate (via `azioni_recupero_scadenze`) ad almeno una scadenza ANCORA APERTA (stessa logica già usata: tempi_scadenza non "pagat" oppure stato_contabile = 'Aperta'). Reset automatico: se tutte le vecchie scadenze sono state pagate, nessuna azione viene più associata → stadio 0.

## 3. UI Recupero Crediti

- Nuova colonna "Stadio" con badge colorato:
  - 0 grigio "Mai sollecitato"
  - 1 blu "1° sollecito — gg/mm (da N gg)"
  - 2 arancione "2° sollecito — gg/mm (da N gg)"
  - 3 rosso "Messa in mora — gg/mm (da N gg)"
- Nuovo filtro `Select` "Stadio": Tutti / Mai / 1° / 2° / Messa in mora (passato come parametro `_stadi` alla RPC).
- Il pulsante "Invio massivo solleciti" già usa `clienteIdsFiltrati`: con il filtro Stadio attivo, isolare "tutti al 1°" e poi scegliere il template `sollecito_2` produce l'ondata di escalation senza modifiche al motore.

## 4. Check coerenza pre-invio (in `InvioMassivoDialog`)

Quando il template scelto è `sollecito_2` o `messa_in_mora` (cioè un'escalation), nell'anteprima il dialog esegue una query lato server per ciascun cliente selezionato:

1. Trova le scadenze attualmente aperte del cliente.
2. Trova le scadenze collegate all'ultima azione email di livello inferiore (sollecito_2 → confronto col sollecito_1; messa_in_mora → confronto col sollecito_2 oppure 1 se manca il 2).
3. Confronta i due set: se il vecchio set NON è interamente incluso nelle aperte correnti → flag `scaduto_cambiato = true`.

Mostra:
- Badge giallo "Scaduto cambiato dal sollecito precedente — verifica" nella riga.
- Riepilogo in testa: "N coerenti · M da verificare".
- Checkbox per riga (default selezionata) → l'utente può deselezionare i casi sospetti.

Non blocca mai l'invio; serve solo come safety net.

## 5. Persistenza al momento dell'invio

- `src/lib/sollecito-massivo.functions.ts` → quando crea la campagna, ricava `tipoTemplate` da `template_email.tipo` e salva su ogni `azioni_recupero` futura il `livello_sollecito` calcolato.
- `src/lib/inngest/sollecito-massivo.server.ts` → al momento dell'insert in `azioni_recupero` aggiunge `livello_sollecito`.
- `src/components/invia-sollecito-dialog.tsx` (invio singolo) → idem.

## File modificati / creati

- `supabase/migrations/<ts>_stadio_escalation.sql` (nuovo)
- `src/integrations/supabase/types.ts` (auto-rigenerato)
- `src/routes/_app/recupero-crediti.tsx` (colonna + filtro stadio)
- `src/components/invio-massivo-dialog.tsx` (check coerenza + riepilogo)
- `src/lib/sollecito-massivo.functions.ts` (passa livello)
- `src/lib/inngest/sollecito-massivo.server.ts` (salva livello su azione)
- `src/components/invia-sollecito-dialog.tsx` (salva livello su invio singolo)

## Cosa NON tocco

- Logica throttling Inngest, wrapper email, footer, mittente, logo.
- Icona scadenziario, conteggi recupero, RLS esistenti.
- Tipo `promemoria_scadenza` (resta escluso dall'escalation per costruzione).
- I codici sede e l'import.

Confermi: procedo con migration + codice?
