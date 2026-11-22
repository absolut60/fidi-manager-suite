# FM96 — Fetta 4b: lista Ordini ed esportazione Gamma

Base: `1fcbb753`. Nessuna pubblicazione. Motore, editor, riapertura e RLS esistenti invariati.

## Implementazione
- Lista solo `tipo=ordine`: schede Da esportare/Esportati, conteggi esatti sotto la visibilità corrente; filtri e ordinamento di esportazione nel database. Date gg/mm/aaaa, estremi inclusivi Europe/Rome (ora legale compresa), conservate con useFiltriPagina.
- Autore ottenuto dalla lettura nomi già condivisa, senza richieste per riga. Data/ora italiana e autore in tabella e schede telefono.
- Spunte e barra solo tramite puoEsportareGamma, solo Da esportare; seleziona tutte usa la medesima query filtrata, paginata senza tetto 500, alternativa_di IS NULL. Lista visualizzata mantiene il tetto esistente di 500. Cambio filtri annulla selezione e scarta risposte tardive.
- Dato reale letto il 22/11: 2 ordini, **0 ordini con alternativa_di**.
- EsportaGammaDialog rilegge con il loader canonico e mostra esiti del motore. ProblemiGamma è condiviso con FileGammaDiProvaDialog; descrizioni originali delle righe e severità conservate.
- Per i lead i riferimenti iniziali rispecchiano ordine → lead; cataloghi identici a FM71, SDI con CampoCodiceSdi/normalizzaCodiceSdi. Salva dati usa solo la nuova RPC e poi rilegge/ricalcola.
- Operazione condivisa: rilettura → motore → un BIFF8 → upload privato UUID/nome → registra solo ordiniEsportati con testate T contate per IND_CLIFOR → download salvaFile → chiusura, aggiornamento e svuotamento selezione. Errore registrazione rimuove esattamente il file appena caricato, conservando l'errore RPC (e segnalando un eventuale errore di ripulitura). Doppio invio protetto con ref sincrona e pulsante disabilitato; salvataggi lead bloccano la generazione.
- Un errore del solo download non annulla un export già registrato: segnalazione distinta, file conservato nello storico.

## Migrazione applicata
`drizzle/migrations/0269_fm96_completa_dati_esportazione_gamma.sql`.
Nuova firma, nessuna firma esistente cambiata. DDL soltanto: nessun dato reale aggiornato, nessuna RLS cambiata.
Definizione letta dal database dopo l'applicazione e confrontata con il file; anon EXECUTE=false, authenticated EXECUTE=true.

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
    UPDATE public.lead SET codice_sdi = _codice_sdi WHERE id = v_ordine.lead_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) IS 'FM96 4b: gate auth_puo_esportare_gamma gemello RUOLI_ESPORTAZIONE_GAMMA; NULL lascia invariato. Normalizzazione SDI solo in codice-sdi.ts.';
REVOKE EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completa_dati_esportazione_gamma(uuid,smallint,text,text,text) TO authenticated;
```

## Test
- **1.356 test TS, 0 fallimenti**, suite completa. Nuovi: fm96-ordini-filtri.test.ts (schede, estremi estate/inverno, 501 ID, alternative escluse, conteggi, preventivi invariati); fm96-export-operazioni.test.ts (pronto+bloccato, solo pronto alla RPC, 5+1 testate, BIFF8, upload fallito, rimozione stesso percorso, salvataggio/ricalcolo/SDI).
- **74 verifiche SQL/concorrenti**: 45 regressioni fetta 4a, 19 nuova RPC, 10 lock due connessioni. Clone locale fm96_4b; auth_vede_preventivo_id mantiene la matrice esplicita documentata in 4a, altri gemelli reali; nessuna pretesa di riprodurre tutte le policy operative. Tutte le prove SQL con ROLLBACK, fixture concorrenti rimosse.
- Nuova RPC: amministratore con aal2 e responsabile_showroom ammessi; store_manager, showroom e amministratore aal1 rifiutati; ordine esportato, cliente, preventivo, invisibile rifiutati; SDI minuscolo/spazio/>7 rifiutati senza scritture; NULL lascia invariato; riferimento solo sull'ordine e SDI solo sul lead; ACL.
- Browser su **320×760, 375×812, 390×844, 768×1024, 1024×768, 1024×1366, 1366×1024, 1280×1800, 1920×1800**. Lista reale su route temporanea; tutti gli accessi dati/auth/storage intercettati localmente, sessione sintetica (non impersonazione di utenti reali). Prova completa in ogni misura: tutte le spunte senza aprire ordine → finestra pronta+bloccato → riferimenti lead/SDI e ricalcolo → errore RPC e rimozione file → secondo tentativo con download BIFF8 5+1 → solo pronto in Esportati con autore/data → filtri italiani. Nessun overflow pagina/dialog o pageerror.
- Screenshot lista/finestra/errore/esportati acquisiti in sequenza; viste finali 375 e 1280 ispezionate, nomi interi nella lista Ordini, footer raggiungibile, finestra compatta fino a 60rem su desktop. Screenshot e XLS sintetici temporanei in /tmp/browser/fm96. Script ripetibile conservato in tests/fm96-gamma.browser.py; fixture in tests/fixtures/fm96-gamma.ts. Route temporanea rimossa.
- Metadata delle route Ordini e index già specifici e completi, nessuna aggiunta fuori richiesta.

## Limite della verifica live
`lovable auth-session --json --self` non trova un account dell'app associato al richiedente. Nessun altro account scelto o impersonato; salvataggio/export reale autenticato **non verificato**. Flusso completo verificato soltanto con risposte locali, SQL sul clone e definizione/ACL sul database reale. Nessun file di prova caricato nel bucket reale.

## Fonti uniche introdotte
esportazione-gamma-operazioni per completamento/orchestrazione export; queryElencoPreventivi per lista/conteggi/selezione; ProblemiGamma per presentazione errori condivisa. Regole tecniche annotate negli AGENTS dell'area; root saturo, non alterate regole del proprietario.
