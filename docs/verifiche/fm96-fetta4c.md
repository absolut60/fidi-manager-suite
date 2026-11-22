# FM96 — Fetta 4c: sola lettura, riapertura e storico Gamma

Base `c6be92ab`. Nessuna pubblicazione; motore, tracciato, trigger e RLS preesistenti invariati. Nessun dato reale modificato.

## Editor e riapertura
- Blocco canonico ordineBloccatoGamma; modoEditorGamma combina il blocco con i gate di consultazione già esistenti. L'ordine esportato non mostra Salva, menu elimina/prova, modifiche testata/consegna/stato, note, allegati, assegnazione, blocchi, righe o piede.
- Il corpo riusa RigheTable/readOnly e presenta valori statici nell'opzione solaLetturaGamma; nasconde maniglie e azioni, lascia disponibili riepilogo articolo e consultazione. Testata riusa modificabile/statoEditabile; piede conserva i controlli preesistenti fuori dal blocco Gamma. Nessuna scrittura automatica dei totali per ordini esportati.
- Banner RiquadroAnagrafica con data/ora Europe/Rome e autore dal get_nomi_utenti condiviso. Genera documento e Vista commerciale restano disponibili; GeneraDocumentoDialog e invio email non modificati, i loro permessi restano quelli preesistenti.
- RiapriOrdineGammaDialog unico per editor e lista Esportati: UUID singolo, motivo facoltativo, RPC esistente, doppio invio protetto con ref, invalidazione ordine/lista/storico/prova. Nessuna riapertura massiva.
- Dopo riapertura sono ripristinati **i gate precedenti dell'ordine**: Salva, stato/consegna e fornitore tornano disponibili agli scriventi. Il corpo degli ordini resta in consultazione secondo la regola FM65 già presente; non allargati i permessi di modifica degli ordini non esportati.
- File Gamma di prova usa puoEsportareGamma in menu e finestra, non più amministratore hardcoded; nascosto per esportati, con guardia aggiuntiva dopo rilettura del loader.

## Storico
- Terza scheda Storico solo con puoEsportareGamma; pannello con controllo proprio e letture sotto RLS utente, nessun client privilegiato.
- Letture paginano 500 righe, senza troncare export/eventi; filtri server inclusivi del giorno Europe/Rome, ordine data decrescente. Filtri dello storico persistenti separati dalla lista.
- Data/ora, autore, tre conteggi e nome file; eventi caricati solo quando la riga è espansa, link all'ordine e motivi a capo. Riaperture con esportazione_id NULL in sezione dedicata, filtrate per data evento. Desktop tabella, telefono ElencoSchede/SchedaLista.
- Firma createSignedUrl **60 secondi** sul bucket privato, fetch dell'URL firmato, salvaFile con blob/nome originali; errori gestiti, pulsante disabilitato durante scarico. Nessun upload, cancellazione o modifica storico in questa fetta.

## Migrazione e confronto finale
Applicata `drizzle/migrations/0270_fm96_gamma_sdi_vuoto_null.sql`. Nessuna firma cambiata.
Confronto byte-identico della migrazione 0269 dopo la sola sostituzione:
```diff
- UPDATE public.lead SET codice_sdi = _codice_sdi WHERE id = v_ordine.lead_id;
+ UPDATE public.lead SET codice_sdi = NULLIF(_codice_sdi, '') WHERE id = v_ordine.lead_id;
```
Corpo restante, commento e REVOKE/GRANT invariati; parametro NULL lascia invariato. Definizione e ACL riletti sul database reale: anon execute false, authenticated execute true.

### Definizione finale
```sql
CREATE OR REPLACE FUNCTION public.completa_dati_esportazione_gamma(_ordine_id uuid, _listino smallint, _macrocategoria text, _categoria text, _codice_sdi text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ordine public.preventivi%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.auth_puo_esportare_gamma(), false) THEN
    RAISE EXCEPTION 'Esportazione Gamma non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(public.auth_vede_preventivo_id(_ordine_id), false) THEN
    RAISE EXCEPTION 'Ordine non visibile' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ordine FROM public.preventivi WHERE id = _ordine_id FOR UPDATE;
  IF NOT FOUND OR v_ordine.tipo <> 'ordine' OR v_ordine.lead_id IS NULL THEN
    RAISE EXCEPTION 'Sono ammessi solo ordini a lead';
  END IF;
  IF v_ordine.esportato_gamma_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ordine già esportato in Gamma: riaprilo per modificarlo';
  END IF;
  IF _codice_sdi IS NOT NULL AND (_codice_sdi !~ '^[A-Z0-9]{0,7}$') THEN
    RAISE EXCEPTION 'Codice SDI non valido: usa al massimo 7 caratteri maiuscoli, senza spazi';
  END IF;
  UPDATE public.preventivi SET listino_rif = COALESCE(_listino, listino_rif),
    macrocategoria_rif = COALESCE(_macrocategoria, macrocategoria_rif),
    categoria_rif = COALESCE(_categoria, categoria_rif) WHERE id = _ordine_id;
  IF _codice_sdi IS NOT NULL THEN
    UPDATE public.lead SET codice_sdi = NULLIF(_codice_sdi, '') WHERE id = v_ordine.lead_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) IS 'FM96 4b: gate auth_puo_esportare_gamma gemello RUOLI_ESPORTAZIONE_GAMMA; NULL lascia invariato. Normalizzazione SDI solo in codice-sdi.ts.';
REVOKE EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) TO authenticated;
```

## Verifiche
- Suite completa: **1.364 test TS, 0 fallimenti, 4.525 assertions**. Otto test nuovi in fm96-gamma-storico.test.ts: gate editor/ripristino, ruoli, 501 export paginati/date, eventi collegati/NULL, UUID scalare, firma 60 s e blob, errori, confronto integrale 0269/0270. Guardia FM95 aggiornata alla decisione FM96 senza concessioni a manage/direzione.
- Clone PostgreSQL locale vuoto `fm96c`, schema fixture già documentato in 4a (matrice test per visibilità, non replica completa delle RLS operative): **68 prove SQL con ROLLBACK** (45 fetta 4a +19 completa dati +4 SDI). Nuovo tests/sql/fm96-gamma-sdi.sql: vuoto → NULL, riferimenti invariati, SDI valido, parametro NULL invariato. Nessun dato residuo, nessun dato dell'app usato.
- Playwright: **320×760, 375×812, 390×844, 768×1024, 1024×768, 1024×1366, 1366×1024, 1280×1800, 1920×1800**. Editor reale sotto layout auth/MFA in modalità incorporata con risposte locali; lista reale tramite route temporanea. Ruolo amministratore in tutti i formati, responsabile_showroom/showroom/store_manager a 375px.
- Percorso: Esportati → Riapri dalla riga/scheda senza aprire ordine → annulla → editor esportato → banner e zero campi di modifica in Testata/Corpo/Piede, zero scritture automatiche → conferma riapertura con motivo → ricaricamento, Salva/consegna/menu prova disponibili → Storico → eventi espansi, riapertura e motivo → filtri date → download firmato 60s con nome e firma di file attesi. Ruoli non ammessi senza Riapri/Storico; responsabile showroom ammesso. Nessun pageerror finale, nessun overflow pagina; scroll del corpo desktop conserva il comportamento preesistente.
- Screenshot stabili lista/editor/tab/conferma/riaperto/storico acquisiti in sequenza, 375 e 1280 ispezionati: banner a capo, conferma contenuta con azioni raggiungibili, storico ed eventi leggibili. Screenshot temporanei in /tmp/browser/fm96c, script conservato in tests/fm96-gamma-4c.browser.py. Route temporanea rimossa dopo la prova.
- App metadata index/Ordini/editor già completi e specifici, nessun cambiamento.

## Limiti
Accesso personale reale tentato con auth-session --self: account corrispondente non disponibile. Nessun altro account impersonato. Riapertura e download reali autenticati **non verificati**: end-to-end con dati/API sintetici soltanto, RPC reale verificata per definizione/ACL e su clone per comportamento. PDF e invio email non eseguiti: percorsi preesistenti lasciati invariati e comando Genera documento verificato visibile; nessuna email di prova inviata.

## File e fonti uniche
Editor preventivatore.$id, RigheTable, PiedePreventivo, PreventiviListView, FileGammaDiProvaDialog; nuovi RiapriOrdineGammaDialog, StoricoGamma, DataExportFiltro estratto senza cambi di regole, esportazioni-gamma-storico; giornoSuccessivoExport reso esportato dalla fonte esistente. Test e rapporto sopra. Regola tecnica annotata nell'AGENTS dell'area, root già oltre budget non alterato. Nuova fonte condivisa per storico/riapertura/gate editor, senza nuove regole business.

## FM97 — limite descrizione 72

- `src/lib/esportazione-gamma.ts`: `LIMITI_GAMMA.descrizione` 70 → 72 (unica fonte); messaggi `codice_troppo_lungo`, `descrizione_troppo_lunga`, `descrizione_troncata` ora leggono il numero da `LIMITI_GAMMA` (template string).
- `src/components/preventivatore/ArticoloInDefinizioneDialog.tsx`: già allineato (contatore e codice leggono `LIMITI_GAMMA`, nessun `maxLength`); nessuna modifica.
- Nessun altro 70/25 su descrizione/codice Gamma in `src/` (PDF e altre schermate non hanno limiti propri).
- `tests/esportazione-gamma.test.ts`: limite 72, 72 valida, 73 rifiutata.
- `tests/esportazione-gamma-motore.test.ts`: bloccante manuale con 73; caso codice 25 con descrizione 72; troncatura attesa a 72; nuovi casi FM97: Gamma 72 (AKINAF01005, intera, nessun avviso), Gamma 73 (avviso con "72", troncata a 72), manuale 72 ammessa.
- Nessuna modifica a DB, RLS o altra logica del motore.

## FM97 — colonne Esportati

- `src/components/preventivatore/PreventiviListView.tsx`: solo Esportati presenta, dopo Totale, Esportato il, Esportato da e l'ultima colonna stretta con Riapri allineato a destra (solo `puoEsportareGamma`). Cliente/Lead conserva nome, codice/badge e le informazioni preesistenti, senza data export o azioni. Conteggio colonne aggiornato anche per caricamento/elenco vuoto.
- Esportati usa la tabella da 768px, con larghezze compatte e intestazioni a capo; telefono conserva ElencoSchede/SchedaLista, data e autore in campi propri e Riapri nel footer. Da esportare e Preventivi mantengono breakpoint e colonne precedenti.
- Data/ora tramite `dataOraGamma` condiviso (gg/mm/aaaa hh:mm, Europe/Rome); autore dal già popolato `esportato_gamma_nome`, lettura nomi condivisa esistente. Nessuna query per riga. La lista non prevede ordinamento cliccando le intestazioni: mantenuto l'ordinamento server preesistente (export decrescente, poi data/creazione/id), senza introdurre un nuovo sistema di ordinamento.
- `tests/fm96-gamma-4c.browser.py`: opzione `--colonne-fm97` per lista reale con due esportati sintetici (cliente e lead con nomi lunghi) e un ordine da esportare. Verificate colonne/cella cliente, Riapri singolo → conferma → Annulla, azioni nascoste per ruoli non ammessi, ritorno a Da esportare, nessun overflow pagina/tabella e nessun errore runtime.
- Playwright superato a **320×760, 375×812, 390×844, 768×1024 touch, 1280×1800, 1920×1800** con amministratore; responsabile_showroom/showroom/store_manager verificati a 375px. Screenshot acquisiti e ispezionati a 375, 768, 1280 e 1920px: colonne separate e pulsante finale, nessuna intestazione sovrapposta sul tablet. Immagini locali in `/tmp/browser/fm96c`; route temporanea `/verifica-fm97` rimossa.
- Suite completa: **1.367 test, 0 fallimenti, 4.532 assertions**; test mirati Gamma/storico/ordini: 93 superati. Compilazione automatica senza errori.
- Nessuna modifica a database, RLS, motore o file Gamma; nessuna pubblicazione. Accesso personale reale tentato con `auth-session --self` ma account corrispondente non disponibile: verifica interfaccia con sessione/API sintetiche locali, senza modificare dati reali o eseguire riaperture reali.

## FM97 — ordine colonne e nome file

- `src/lib/esportazione-gamma.ts`: le stesse 47 intestazioni, senza colonne aggiuntive/vuote, nell'ordine esatto indicato da Andrea; maiuscole e spazio di `magg %` invariati. `CODICE_DOCUMENTO`, `COD_COD_CLI` e `IND_CLIFOR` ora vuoti sulle R cliente e fornitore; testate T invariate.
- `src/lib/esportazione-gamma-file.ts`: `nomeFileGamma` restituisce sempre **ORDINI_CLIENTI_FORNITORI.xls**; parametro data ancora accettato per compatibilità. Scrittore BIFF8 già alimentato da `COLONNE_FILE_GAMMA`, senza ordine duplicato: non richiede cambi; foglio sempre **Sheet1**.
- Verificati `sommaRighe` e gruppi del motore: usano articolo/condizioni e ID fornitore già noti, non i tre campi sulle R. `esportazione-gamma-operazioni` ed `EsportaGammaDialog` contano già soltanto le T prima di leggere `IND_CLIFOR`: nessuna modifica necessaria. Il nome unico alimenta download, upload e `_nome_file`; percorso storage conserva UUID/upsert false.
- `tests/esportazione-gamma-motore.test.ts`: guardia con elenco letterale delle 47 colonne richieste e chiavi di ogni riga; test precedenti aggiornati per appartenenza alla T precedente, coordinate BIFF8 riordinate e nome fisso. Nuove prove: R vuote nei tre campi sia nel motore sia dopo rilettura BIFF8, T cliente/lead/fornitore conservate, nome indipendente dalla data. Rilettura verifica anche Sheet1, intestazioni esatte, data italiana, prezzo a quattro decimali e fattore UM.
- `tests/esportazione-gamma-dati.test.ts`: percorso lettura → motore → BIFF8 → rilettura usa la T precedente per distinguere i prezzi fornitore delle due sedi, attesi 8 e 9.
- `tests/fm96-export-operazioni.test.ts`: nome restituito/download e `_nome_file` storico identici, UUID/nome nel percorso, due esportazioni con percorsi distinti; confermati conteggi 5 documenti fornitore + 1 cliente, registrazione solo pronti e ripulitura in caso di errore.
- Suite completa: **1.370 test superati, 0 fallimenti, 4.543 assertions**; compilazione automatica senza errori. File BIFF8 generati e riletti nei test locali; nessun export o dato reale scritto.
- Nessuna modifica a DB, RLS, prezzi, somme, bloccanti o `PreventiviListView`; nessuna pubblicazione. Gli export storici già salvati restano intatti: il nuovo nome/ordine vale per i file generati da questo codice.
