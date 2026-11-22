# FM97 — Completa lead nella finestra Esporta in Gamma

## Intervento
- `EsportaGammaDialog.tsx`: azioni «Completa» derivate solo dagli avvisi del motore e da `AVVISI_LEAD_GAMMA`; nome secondo il tipo soggetto, P.IVA/CF e `BloccoIndirizzo` aprono nella stessa sezione. Un solo Salva dati per riferimenti ordine, SDI e anagrafica lead, seguito dalla rilettura già esistente e dal ricalcolo del motore.
- Campi precompilati protetti: `patchAnagraficaLeadGamma` invia solo quelli inizialmente mancanti; `BloccoIndirizzo` ha un'opzione per proteggere singoli campi anche quando Google restituisce l'indirizzo completo. Nessun cambiamento per gli altri utilizzatori.
- Bozza ricreata dopo il salvataggio/rilettura; i dati ora presenti non restano modificabili. Errori mostrati senza cancellare gli avvisi o dichiarare successo.
- `esportazione-gamma-operazioni.ts`: una chiamata alla RPC gemella `completa_dati_lead_esportazione_gamma`; chiavi ammesse esplicite, NULL distinto da stringa vuota. SDI resta normalizzato solo da `codice-sdi.ts`.

## Normalizzazione fiscale verificata
I form reali Nuovo lead e Scheda lead **non hanno validazioni checksum o regex P.IVA/CF**: massimo 20 caratteri, trim e NULL se vuoto. Non sono state inventate nuove restrizioni né riusate impropriamente le regole WhatsApp/Cerved.
La stessa normalizzazione e il limite sono ora in `src/lib/lead-anagrafica.ts`, riusati da `lead-crea.ts`, Nuovo lead, Scheda lead e completamento Gamma. Nessun cambiamento di valori accettati, maiuscole/minuscole o logica fiscale.

## Migrazione, compatibilità e ACL
Applicata `drizzle/migrations/0272_fm97_completa_lead_gamma.sql`; nessun dato, schema di tabella, RLS o trigger esistente modificato.
Scelta additiva: **RPC gemella**, non nuova firma della vecchia RPC, quindi nessun DROP e nessuna incompatibilità per l'app pubblicata. La gemella chiama la funzione precedente nella stessa transazione: stessi gate `auth_puo_esportare_gamma` e `auth_vede_preventivo_id`, stesso lock FOR UPDATE dell'ordine, stessa esclusione di ordini esportati/non a lead. Non esiste un parametro lead_id controllabile dal chiamante: l'UPDATE usa solo il lead collegato alla testata bloccata.
Il JSON ammette solo le 13 colonne anagrafiche richieste (SDI è il parametro dedicato); chiavi estranee, valori non testuali/non NULL e JSON non oggetto rifiutati atomicamente. JSON NULL/assenza conserva il campo, stringa vuota dopo trim lo porta a NULL. I riferimenti ordine mantengono la convenzione canonica della vecchia RPC; non si scrivono sul lead.

Definizioni e ACL rilette sul database dopo applicazione:
- vecchia `completa_dati_esportazione_gamma(uuid,smallint,text,text,text)` MD5 `c7dbd549938da29afae8bdec9a1fc8bf`, invariata;
- nuova `completa_dati_lead_esportazione_gamma(uuid,smallint,text,text,text,jsonb)` MD5 `a70582e8296a3cfcfc48ddec97d3e76a`;
- entrambe ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; `has_function_privilege(anon, EXECUTE)=false`, `authenticated=true`, PUBLIC senza EXECUTE. Nessun allargamento dei ruoli applicativi.

## Prove
- Suite completa: **1.387 test, 0 fallimenti, 4.576 assertions**. Cinque test nuovi in `tests/fm97-completa-lead-gamma.test.ts`: regole fiscali preesistenti, precompilati protetti, singola chiamata e avvisi spariti/testata file aggiornata, NULL/vuoto/whitelist, errore propagato. Aggiornato il test operazioni FM96 alla RPC gemella.
- `tests/sql/fm97-completa-lead-gamma.sql`: **44 controlli superati** sul clone locale vuoto; tutte le 24 voci dell'enum ruoli (solo amministratore/responsabile_showroom ammessi), senza ruolo e MFA insufficiente rifiutati; anon no/authenticated sì; invisibile, esportato, preventivo e ordine non a lead rifiutati; NULL invariato/vuoto NULL/trim; anagrafica+SDI+riferimenti atomici; chiavi estranee e JSON errati annullano anche ordine/SDI; solo lead collegato aggiornato, note e altro lead intatti.
- Clone con `tests/sql/fm96-clone-base.sql`, colonne stato export aggiunte solo localmente, gate e vecchia RPC letti dal database reale, nuova migrazione applicata. Visibilità simulata dalla matrice della fixture FM96; test di scrittura eseguiti anche come authenticated. **ROLLBACK**, zero ordini e zero lead rimasti; nessuna fixture sul database reale.
- Playwright `tests/fm97-completa-lead.browser.py`, contenuto reale della finestra via fixture locale: clic indirizzo → suggerimento Google sintetico → CAP/città compilati → Salva dati → una RPC attraverso il chiamante condiviso → rilettura fonte locale → tre avvisi spariti; provincia/CAP già presenti protetti; nome/cognome persona fisica e identificativo fiscale; errore e possibilità di riprovare. Screenshot compilazione/salvato/errore; assenza overflow e larghezza ≤60rem verificata. Google e persistenza sono simulati, nessuna scrittura HTTP al database reale.
- Compilazione automatica senza errori; motor/file Gamma, riga manuale e PreventiviListView invariati.
- Playwright superato a **320, 375, 390, 768 touch, 1280 e 1920 px**; screenshot ispezionati a 375/768/1280: una colonna telefono, campi CAP/città/provincia affiancati su tablet/PC, azioni raggiungibili, nessun testo sovrapposto. Gli screenshot del salvataggio mostrano gli avvisi rimossi.

## Dati reali e limiti
Lettura reale del 22/11: **ORD-105/26 già esportato**, indirizzo/CAP/città ora presenti: il contesto iniziale non descrive più lo stato corrente; nessuna modifica a quell'ordine/lead.
La prova autenticata persistita sul progetto non è disponibile: `auth-session --self` non trova un account app per l'email del richiedente. Non selezionato un altro utente arbitrariamente; SQL su clone e UI con fonte locale. Suggerimenti Google reali e salvataggio autenticato reale restano non verificati.

## File toccati e nuove fonti
- Migrazione 0272 e metadati/tipi generati dallo strumento.
- `src/components/preventivatore/EsportaGammaDialog.tsx`, `src/components/blocco-indirizzo.tsx`.
- `src/lib/esportazione-gamma-operazioni.ts`, `src/lib/lead-anagrafica.ts`, `src/lib/lead-crea.ts`.
- `src/components/lead/nuovo-lead-dialog.tsx`, `src/routes/_app/lead.$leadId.tsx`: solo riuso equivalente dei limiti/normalizzazione.
- Test TS FM96/FM97, SQL, browser e `tests/fixtures/fm97-completa-lead.tsx`; route di prova temporanea rimossa al termine.
- `AGENTS.md`, AGENTS preventivatore e roadmap: regole di fonte unica e completamento.

Nessuna pubblicazione. Nessuna firma esistente cambiata; non occorre ripubblicare per mantenere operativo il chiamante precedente.

## Definizione finale applicata

<!-- DEFINIZIONE_FINALE -->
```sql
CREATE OR REPLACE FUNCTION public.completa_dati_lead_esportazione_gamma(_ordine_id uuid, _listino smallint, _macrocategoria text, _categoria text, _codice_sdi text, _anagrafica jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_dati jsonb := COALESCE(_anagrafica, '{}'::jsonb);
BEGIN
  -- Il gate canonico controlla ruolo, visibilita, tipo/lead ed export e blocca la testata FOR UPDATE.
  -- La chiamata e l'UPDATE sotto sono nella medesima transazione: ogni errore annulla entrambi.
  PERFORM public.completa_dati_esportazione_gamma(_ordine_id, _listino,
    CASE WHEN _macrocategoria IS NULL THEN NULL ELSE NULLIF(btrim(_macrocategoria), '') END,
    CASE WHEN _categoria IS NULL THEN NULL ELSE NULLIF(btrim(_categoria), '') END,
    CASE WHEN _codice_sdi IS NULL THEN NULL ELSE btrim(_codice_sdi) END);
  IF jsonb_typeof(v_dati) <> 'object' THEN RAISE EXCEPTION 'Dati anagrafici non validi'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(v_dati) e WHERE e.key <> ALL(ARRAY[
    'ragione_sociale','nome','cognome','partita_iva','codice_fiscale','indirizzo','cap','citta','provincia',
    'telefono','cellulare','email','tipo_soggetto']) OR jsonb_typeof(e.value) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'Campo anagrafico non ammesso';
  END IF;
  SELECT lead_id INTO v_lead_id FROM public.preventivi WHERE id = _ordine_id;
  UPDATE public.lead SET
    ragione_sociale = CASE WHEN v_dati->>'ragione_sociale' IS NULL THEN ragione_sociale ELSE NULLIF(btrim(v_dati->>'ragione_sociale'), '') END,
    nome = CASE WHEN v_dati->>'nome' IS NULL THEN nome ELSE NULLIF(btrim(v_dati->>'nome'), '') END,
    cognome = CASE WHEN v_dati->>'cognome' IS NULL THEN cognome ELSE NULLIF(btrim(v_dati->>'cognome'), '') END,
    partita_iva = CASE WHEN v_dati->>'partita_iva' IS NULL THEN partita_iva ELSE NULLIF(btrim(v_dati->>'partita_iva'), '') END,
    codice_fiscale = CASE WHEN v_dati->>'codice_fiscale' IS NULL THEN codice_fiscale ELSE NULLIF(btrim(v_dati->>'codice_fiscale'), '') END,
    indirizzo = CASE WHEN v_dati->>'indirizzo' IS NULL THEN indirizzo ELSE NULLIF(btrim(v_dati->>'indirizzo'), '') END,
    cap = CASE WHEN v_dati->>'cap' IS NULL THEN cap ELSE NULLIF(btrim(v_dati->>'cap'), '') END,
    citta = CASE WHEN v_dati->>'citta' IS NULL THEN citta ELSE NULLIF(btrim(v_dati->>'citta'), '') END,
    provincia = CASE WHEN v_dati->>'provincia' IS NULL THEN provincia ELSE NULLIF(btrim(v_dati->>'provincia'), '') END,
    telefono = CASE WHEN v_dati->>'telefono' IS NULL THEN telefono ELSE NULLIF(btrim(v_dati->>'telefono'), '') END,
    cellulare = CASE WHEN v_dati->>'cellulare' IS NULL THEN cellulare ELSE NULLIF(btrim(v_dati->>'cellulare'), '') END,
    email = CASE WHEN v_dati->>'email' IS NULL THEN email ELSE NULLIF(btrim(v_dati->>'email'), '') END,
    tipo_soggetto = CASE WHEN v_dati->>'tipo_soggetto' IS NULL THEN tipo_soggetto ELSE NULLIF(btrim(v_dati->>'tipo_soggetto'), '') END
  WHERE id = v_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead dell''ordine non disponibile'; END IF;
END;
$function$

```
