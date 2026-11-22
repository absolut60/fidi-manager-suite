# FM96 — Fetta 4a

## Inventario prima dei nuovi trigger (22/11/2026)

Ricognizione sul database reale: tutte le funzioni con DML verso preventivi,
blocchi_preventivo, righe_preventivo e tutti i trigger installati su queste tabelle.

| Funzione / trigger esistente | Può interessare un ordine esportato? | Gestione |
|---|---|---|
| trasforma_preventivo_in_ordine | Crea un nuovo ordine, blocchi e righe, aggiorna il preventivo origine | Nuovo ordine non esportato: consentito; origine tipo preventivo fuori dal blocco |
| ricalcola_qta_ordinata_origine / trg_ricalcola_qta_ordinata | Aggiorna righe origine su INSERT/UPDATE/DELETE delle righe ordine | Origine normale preventivo invariata; eventuale origine ordine esportato protetta |
| chiudi_preventivo, riapri_preventivo | No: rifiutano tipo diverso da preventivo | Nessun effetto |
| ripristina_stato_preventivo_dopo_ordine / trg_ripristina_stato_preventivo_dopo_ordine | Dopo DELETE ordine, aggiorna solo origine tipo preventivo | DELETE ordine esportato bloccato prima; origine preventivo invariata |
| lead_riaggancia_preventivi_cliente / trg_lead_riaggancia_preventivi_cliente | Sì, aggiorna cliente_id, lead_id, lead_origine_id | Eccezione per sole colonne di servizio, riaggancio ammesso |
| update_updated_at / update_preventivi_updated_at, update_blocchi_preventivo_updated_at, update_righe_preventivo_updated_at | Sì, timestamp di servizio | Timestamp testata ammesso; modifiche di contenuto a blocchi/righe bloccate |
| preventivi_valida_alternativa_autore / preventivi_alternativa_autore | Valida/modifica NEW sulla testata | Non apre un bypass: confronto di tutte le colonne non di servizio |
| preventivi_assegna_numero / preventivi_numero_assegnazione | Solo INSERT testata | Nessun ordine preesistente esportato interessato |
| preventivi_blocca_modifica_numero / preventivi_numero_immutabile | Valida UPDATE numero | Protezione esistente conservata, nessun bypass |
| notifica_assegnazione_preventivo / trg_notifica_assegnazione_preventivo | Legge NEW, scrive notifiche, non il documento | Modifica assegnazione ordine esportato bloccata BEFORE; notifiche invariate |
| preventivi_impedisci_eliminazione_con_ordini / trg_preventivi_impedisci_eliminazione_con_ordini | Controlla DELETE preventivo con ordini | Protezione esistente conservata; blocco Gamma solo per tipo ordine |
| inviaEmailPreventivo (TS) | Può aggiornare stato bozza → inviato | UPDATE di contenuto su ordine esportato rifiutato; nessuna modifica al percorso email |
| API preventivatore (salvataggi testata, blocchi, righe, duplicazione/eliminazione) | Sì, scritture dirette | Trigger proteggono tutte le scritture; copie nuove non esportate ammesse |

I preventivi tipo `preventivo` non ricevono alcun blocco Gamma. Eccezioni previste:
RPC registra/riapri (flag locale ripristinato prima del ritorno), ruolo service_role,
sole colonne di servizio sulla testata. I trigger sui figli controllano sia il
vecchio sia il nuovo genitore e prendono il lock della testata per serializzare
le modifiche con la registrazione dell'esportazione.

## Migrazioni applicate

- `drizzle/migrations/0266_fm96_esportazioni_gamma.sql`: gate e RPC acquisti,
  storico/eventi con GRANT SELECT per authenticated e policy restrittive MFA,
  tre colonne nullable, RPC atomiche e tre trigger BEFORE, policy del bucket.
- `drizzle/migrations/0267_fm96_gamma_campi_servizio_ruoli.sql`: il test di
  riapertura diretta ha riprodotto un bypass attraverso l'eccezione delle colonne
  di servizio. La definizione finale controlla il gate Gamma anche se cambiano
  soltanto i tre campi di esportazione. Nessuna policy esistente modificata.
- Bucket privato `esportazioni-gamma` creato tramite API Storage, non con SQL.
  Upload e lettura col gate Gamma; DELETE soltanto proprio file non ancora
  registrato, nessuna policy UPDATE. Il controllo sul file già registrato
  conserva lo storico anche dopo la riapertura.
- `esportazioni_gamma_eventi.ordine_id` usa `ON DELETE SET NULL`: se un ordine
  riaperto viene successivamente eliminato, resta il numero copiato e non si
  perde lo storico. Le esportazioni/file non vengono eliminati dalla riapertura.
- Nessun backfill o DML sui dati esistenti, nessun DROP, nessuna modifica a
  `esportazioni`, `stores.listino_riferimento` o RLS `articoli_gamma_listini`.

## Fonte unica TypeScript e compatibilità

`RUOLI_ESPORTAZIONE_GAMMA`, `puoEsportareGamma` e `ordineBloccatoGamma` in
`src/lib/esportazione-gamma.ts`; guardia dei due elenchi SQL/TS nella suite.
Il futuro ruolo back office non è aggiunto. La scelta del listino rimane
esclusivamente in `listinoAcquistoSede` e non è duplicata nella RPC.

Il loader usa **soltanto** `acquisti_gamma_ordini` per gli acquisti, in blocchi
150 ordini e pagine da 1.000 coppie articolo/listino, con ordinamento stabile e
deduplicazione. Restano invariate tutte le altre letture e il filtro del listino
per ciascun ordine. Nessun client privilegiato nel browser. L'unico chiamante
attuale del loader è la finestra di prova già riservata agli amministratori.
Confronto del corpo di `costruisciEsportazioneGamma` con `6e1321fc`: identico.

### API applicative censite

Oltre ai trigger SQL elencati sopra, tutte queste scritture sono protette senza
modificarne il codice: `createPreventivo`, `updatePreventivo`, `deletePreventivo`,
`duplicaPreventivo`, `insertBlocco`, `updateBlocco`, `deleteBlocco`,
`applicaScontoPiedeARighe`, `applicaAggiornaListini`, `addBloccoVuoto`,
`addBloccoDaKit`, `insertRiga`, `updateRiga`, `salvaPatchRigaCalcolata`,
`deleteRiga`, `ricalcolaBloccoSuNuovaQuantita`, `reorderRighe`, `reorderBlocchi`
(`preventivi-api.ts`). Le scritture su ordine esportato vengono rifiutate;
creazione di un nuovo documento e operazioni su preventivo normale sono libere
secondo le RLS preesistenti. `AssegnazionePreventivo` cambia assegnazioni: su un
ordine esportato è bloccata. `chiudiPreventivo`, `riapriPreventivo` e
`trasformaPreventivoInOrdine` delegano alle RPC già censite, limitate al tipo
preventivo. Nessuna schermata nuova o pubblicazione.

## Esito delle verifiche

- **1.330 test TS verdi, 0 falliti**, 163 file, 4.449 asserzioni (`bun test ./tests`).
- **45 verifiche SQL superate**, transazione finale **ROLLBACK**:
  `tests/sql/fm96-esportazioni-gamma.sql`, su database locale isolato.
- Ruoli amministratore con/senza MFA, responsabile showroom a Lissone con
  listino 10 che tramite RPC legge anche il 20 dell'ordine Pianezza; lettura
  diretta del 20 negata dalla policy di sede. Store manager/showroom rifiutati.
- Acquisti escludono listino 9, preventivi, ordini non visibili e articoli
  estranei; test loader oltre 1.000 prezzi, blocchi 150 e acquisto_assente.
- Registrazione normalizza duplicati, salva un evento per ordine; un ordine
  già esportato o un preventivo nell'insieme provoca rifiuto senza scritture
  parziali. Flag locale ripristinato prima del ritorno della RPC.
- UPDATE/DELETE testata e INSERT/UPDATE/DELETE di blocchi/righe rifiutati;
  spostamento vecchio/nuovo genitore protetto. Riapertura singola, seconda
  testata ancora esportata, modifica dopo riapertura consentita.
- Preventivo normale invariato, timestamp testata ammesso, riaggancio lead con
  **funzione reale** ammesso; service_role esente sui tre livelli.
- Nessuna scrittura diretta allo storico; owner file obbligatorio, pulizia
  proprio file consentita, file altrui/registrato non eliminabile.
- Schema/ACL verificati sul database dell'app: cinque funzioni SECURITY DEFINER
  con `search_path=public`, anon senza EXECUTE; trigger non eseguibile da
  authenticated, RPC acquisti/registrazione/riapertura solo authenticated.
  Corpi `prosrc` identici byte per byte a quelli delle migrazioni finali.
- Database dell'app: **0 esportazioni, 0 eventi, 0 ordini marcati, 0 oggetti nel
  bucket** dopo le verifiche; bucket confermato privato. Nessun dato di prova.
- Scansione backend rieseguita: nessun nuovo risultato non ignorato.
- Compilazione automatica: **build OK**; controllo dei tipi separato non
  eseguito manualmente, come richiesto dal vincolo della piattaforma.

### Limite della prova autenticata

La sessione personale non è disponibile: il tentativo di ottenere quella del
richiedente non trova un account dell'app corrispondente. Nessun altro account
è stato scelto o impersonato. I test con ruoli/MFA sono stati eseguiti sul clone
isolato con claim sintetici, non nella sessione reale di Ombretta.

`tests/sql/fm96-clone-base.sql` conserva la fotografia delle colonne dello
schema e le definizioni reali di `auth_mfa_ok`, `has_role`,
`profilo_store_id_corrente`, `auth_listini_sede`, riaggancio lead e quantità
ordinate. Non contiene dati reali né FK operative; il helper di visibilità
`auth_vede_preventivo_id` è sostituito **solo nel clone** da una matrice esplicita
ordine/utente. Non è una verifica end-to-end della visibilità reale del profilo.

Per ripetere: creare un database di prova vuoto in un cluster locale con ruoli
`authenticated`, `anon`, `service_role`; eseguire nell'ordine il clone-base,
0266, 0267 e il file di test SQL. Nessuno di questi file di fixture/test va
applicato al database dell'app. Il test termina con ROLLBACK.

## File toccati

- Le due migrazioni e rispettivi journal/snapshot generati dalla piattaforma.
- `src/integrations/supabase/types.ts` (rigenerato).
- `src/lib/esportazione-gamma.ts`, `src/lib/esportazione-gamma-dati.ts`.
- `tests/esportazione-gamma-dati.test.ts`, `tests/esportazione-gamma-stato.test.ts`.
- `tests/sql/fm96-clone-base.sql`, `tests/sql/fm96-esportazioni-gamma.sql`.
- Questo rapporto, `roadmap.md`, nota di fonte unica in `src/lib/AGENTS.md`.

## Definizioni finali dal database (pg_get_functiondef)

### acquisti_gamma_ordini

```sql
CREATE OR REPLACE FUNCTION public.acquisti_gamma_ordini(_ordine_ids uuid[])
 RETURNS TABLE(articolo_codice text, listino smallint, acq_prezzo numeric, acq_sc1 numeric, acq_sc2 numeric, acq_sc3 numeric, acq_trasporto_perc numeric, acq_trasporto_euro numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.articolo_codice, a.listino, a.acq_prezzo, a.acq_sc1, a.acq_sc2, a.acq_sc3, a.acq_trasporto_perc, a.acq_trasporto_euro
  FROM public.articoli_gamma_listini a
  WHERE a.listino <> 9 AND a.articolo_codice IN (
    SELECT r.articolo_codice FROM public.righe_preventivo r
    JOIN public.blocchi_preventivo b ON b.id = r.blocco_id
    JOIN public.preventivi p ON p.id = b.preventivo_id
    WHERE p.id = ANY(_ordine_ids) AND p.tipo = 'ordine' AND public.auth_vede_preventivo_id(p.id)
  );
END;
$function$;
```

### auth_puo_esportare_gamma

```sql
CREATE OR REPLACE FUNCTION public.auth_puo_esportare_gamma()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Gemello di RUOLI_ESPORTAZIONE_GAMMA in src/lib/esportazione-gamma.ts.
  SELECT public.auth_mfa_ok() AND (
    public.has_role(auth.uid(), 'amministratore') OR
    public.has_role(auth.uid(), 'responsabile_showroom')
  );
$function$;
```

### blocca_ordine_esportato_gamma

```sql
CREATE OR REPLACE FUNCTION public.blocca_ordine_esportato_gamma()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old uuid;
  v_new uuid;
  v_p public.preventivi%ROWTYPE;
  v_servizio text[] := ARRAY['esportato_gamma_at','esportato_gamma_da','esportazione_gamma_id','updated_at','cliente_id','lead_id','lead_origine_id'];
BEGIN
  IF current_setting('role', true) = 'service_role' OR COALESCE(auth.role(), '') = 'service_role'
     OR (current_setting('app.gamma_scrittura', true) = 'rpc' AND COALESCE(public.auth_puo_esportare_gamma(), false)) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'preventivi' THEN
    -- L'eccezione di servizio non deve permettere riaperture fuori dai ruoli Gamma.
    IF TG_OP = 'UPDATE' AND OLD.tipo = 'ordine'
       AND (NEW.esportato_gamma_at, NEW.esportato_gamma_da, NEW.esportazione_gamma_id)
           IS DISTINCT FROM (OLD.esportato_gamma_at, OLD.esportato_gamma_da, OLD.esportazione_gamma_id)
       AND NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
      RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
    END IF;
    IF OLD.tipo = 'ordine' AND OLD.esportato_gamma_at IS NOT NULL THEN
      IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_servizio) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_servizio) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'blocchi_preventivo' THEN
      IF TG_OP <> 'INSERT' THEN v_old := OLD.preventivo_id; END IF;
      IF TG_OP <> 'DELETE' THEN v_new := NEW.preventivo_id; END IF;
    ELSE
      IF TG_OP <> 'INSERT' THEN SELECT preventivo_id INTO v_old FROM public.blocchi_preventivo WHERE id = OLD.blocco_id; END IF;
      IF TG_OP <> 'DELETE' THEN SELECT preventivo_id INTO v_new FROM public.blocchi_preventivo WHERE id = NEW.blocco_id; END IF;
    END IF;
    FOR v_p IN SELECT p.* FROM public.preventivi p WHERE p.id IN (v_old, v_new) ORDER BY p.id FOR UPDATE LOOP
      IF v_p.tipo = 'ordine' AND v_p.esportato_gamma_at IS NOT NULL THEN
        RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
```

### registra_esportazione_gamma

```sql
CREATE OR REPLACE FUNCTION public.registra_esportazione_gamma(_ordine_ids uuid[], _nome_file text, _file_path text, _n_doc_fornitore integer, _n_doc_cliente integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_p public.preventivi%ROWTYPE;
  v_errori text[] := '{}';
  v_id uuid;
  v_flag text := current_setting('app.gamma_scrittura', true);
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF _ordine_ids IS NULL OR cardinality(_ordine_ids) = 0 OR array_position(_ordine_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Seleziona almeno un ordine valido';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM (SELECT DISTINCT unnest(_ordine_ids) id) x;
  IF NULLIF(btrim(_nome_file), '') IS NULL OR NULLIF(btrim(_file_path), '') IS NULL
     OR _n_doc_fornitore IS NULL OR _n_doc_cliente IS NULL OR _n_doc_fornitore < 0 OR _n_doc_cliente < 0 THEN
    RAISE EXCEPTION 'Dati del file Gamma non validi';
  END IF;
  -- Lock in ordine stabile, prima di qualsiasi scrittura.
  PERFORM p.id FROM public.preventivi p WHERE p.id = ANY(v_ids) ORDER BY p.id FOR UPDATE;
  FOR v_id IN SELECT unnest(v_ids) LOOP
    SELECT * INTO v_p FROM public.preventivi WHERE id = v_id;
    IF NOT FOUND THEN
      v_errori := array_append(v_errori, v_id::text || ': inesistente');
    ELSIF NOT COALESCE(public.auth_vede_preventivo_id(v_id), false) THEN
      v_errori := array_append(v_errori, v_id::text || ': non visibile');
    ELSIF v_p.tipo <> 'ordine' THEN
      v_errori := array_append(v_errori, COALESCE(v_p.numero, v_id::text) || ': non è un ordine');
    ELSIF v_p.esportato_gamma_at IS NOT NULL THEN
      v_errori := array_append(v_errori, COALESCE(v_p.numero, v_id::text) || ': già esportato');
    END IF;
  END LOOP;
  IF cardinality(v_errori) > 0 THEN
    RAISE EXCEPTION 'Esportazione Gamma annullata: %', array_to_string(v_errori, '; ');
  END IF;
  INSERT INTO public.esportazioni_gamma(creata_da, nome_file, file_path, n_ordini, n_documenti_fornitore, n_documenti_cliente)
  VALUES(auth.uid(), _nome_file, _file_path, cardinality(v_ids), _n_doc_fornitore, _n_doc_cliente) RETURNING id INTO v_id;
  PERFORM set_config('app.gamma_scrittura', 'rpc', true);
  UPDATE public.preventivi SET esportato_gamma_at = now(), esportato_gamma_da = auth.uid(), esportazione_gamma_id = v_id WHERE id = ANY(v_ids);
  INSERT INTO public.esportazioni_gamma_eventi(esportazione_id, ordine_id, numero_ordine, tipo, utente)
  SELECT v_id, id, numero, 'esportato', auth.uid() FROM public.preventivi WHERE id = ANY(v_ids);
  PERFORM set_config('app.gamma_scrittura', COALESCE(v_flag, ''), true);
  RETURN v_id;
END;
$function$;
```

### riapri_ordine_gamma

```sql
CREATE OR REPLACE FUNCTION public.riapri_ordine_gamma(_ordine_id uuid, _motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p public.preventivi%ROWTYPE; v_flag text := current_setting('app.gamma_scrittura', true);
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.preventivi WHERE id = _ordine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine inesistente'; END IF;
  IF NOT COALESCE(public.auth_vede_preventivo_id(_ordine_id), false) THEN RAISE EXCEPTION 'Ordine non visibile' USING ERRCODE = '42501'; END IF;
  IF v_p.tipo <> 'ordine' THEN RAISE EXCEPTION 'Il documento % non è un ordine', v_p.numero; END IF;
  IF v_p.esportato_gamma_at IS NULL THEN RAISE EXCEPTION 'Ordine % non esportato in Gamma', v_p.numero; END IF;
  PERFORM set_config('app.gamma_scrittura', 'rpc', true);
  UPDATE public.preventivi SET esportato_gamma_at = NULL, esportato_gamma_da = NULL, esportazione_gamma_id = NULL WHERE id = _ordine_id;
  INSERT INTO public.esportazioni_gamma_eventi(esportazione_id, ordine_id, numero_ordine, tipo, utente, motivo)
  VALUES(v_p.esportazione_gamma_id, v_p.id, v_p.numero, 'riaperto', auth.uid(), NULLIF(btrim(_motivo), ''));
  PERFORM set_config('app.gamma_scrittura', COALESCE(v_flag, ''), true);
END;
$function$;
```
