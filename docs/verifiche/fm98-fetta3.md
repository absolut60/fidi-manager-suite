# FM98 — Fetta 3: note per il cliente e libreria

## Risultato e perimetro
- Note per il cliente nel Piede di preventivi e ordini di tutte le linee, incluse creazioni di ordini senza preventivo; area crescente, salvataggio onBlur tramite la mutation già esistente e chiave `salva-preventivo`.
- Note interne `preventivi.note` e `preventivi_note` non modificate: aggiunta soltanto la dicitura «Note interne, non stampate» sotto l’area interna.
- Libreria condivisa per linea con ricerca su titolo/testo, inserimento in fondo separato da riga vuota, nuova nota, aggiornamento di nota modificabile, modifica ed eliminazione con conferma. In sola consultazione il testo documento non è modificabile/inseribile; la gestione della libreria segue i propri permessi indipendenti.
- Duplicazione stesso cliente, nuovo cliente e alternativa copiano `note_cliente` nel payload comune; test dinamico su stesso cliente/alternativa. Copia ordine atomica in RPC.
- Renderer PDF unico dopo Totale/riepilogo IVA e prima delle condizioni, 8,5 pt titolo navy e 8 pt testo; righe vuote conservate, wrapping e testata di continuazione, piede/banda riservati. Ramo vuoto non modifica alcuno stato di jsPDF.
- Export Gamma, prezzi, IVA, note interne, liste interne e gate condivisi non modificati. Anteprima, download, stampa ed email continuano a ricevere il blob prodotto dal percorso esistente; nessuna rigenerazione nuova introdotta.
- Nessuna pubblicazione eseguita; nessun dato reale scritto o corretto.

## Passo A verificato prima di B
Applicata `drizzle/migrations/0273_fm98_note_cliente_libreria.sql`; immediatamente lette `information_schema.columns`, `pg_policies`, `pg_proc` e ACL della RPC **prima** delle modifiche interfaccia/stampa.
- `preventivi.note_cliente`: text nullable, default NULL, nessun backfill.
- Libreria: colonne, default, vincoli immutabili titolo/testo, indice `(linea,titolo)` e trigger `update_updated_at`.
- Policy `preventivi`: le cinque definizioni applicate sono identiche a quelle lette prima; non esiste una policy nuova sul preventivo.
- `auth_ha_accesso_preventivi`: md5 `358f0a4efec585afec419755519d2dde`, invariato.
- `auth_legge_note_preventivo`: md5 `34f04841194a8ea90cf4228e8814906c`.
- `auth_scrive_note_preventivo`: md5 `480cf4e05c7befc7d26c7ffd9d4d3aa2`.

### Scostamento necessario: seconda migrazione di soli privilegi
La richiesta prevedeva una sola migrazione. Il controllo reale di `pg_class.relacl` ha però rilevato privilegi `anon` ereditati automaticamente sulla nuova tabella, nonostante i soli GRANT espliciti ad authenticated/service_role. RLS negava già letture anonime, ma la richiesta impone **nessun accesso anon**.
È stata applicata quindi `drizzle/migrations/0274_fm98_note_libreria_privilegi_anon.sql` per revocarli; revocati anche TRUNCATE/REFERENCES/TRIGGER ereditati ad authenticated. Nessuna policy o dato esistente modificato, nessun file applicato riscritto. Verifica finale: `has_table_privilege(anon,...,SELECT)=false`, INSERT=false; authenticated conserva SELECT/INSERT/UPDATE/DELETE, service_role ALL. I privilegi tecnici gestiti dalla piattaforma non sono stati alterati.

La prima richiesta di migrazione era stata rifiutata e annullata per ambiguità PostgreSQL `ANY(subquery)`; il cast esplicito dell’array distingue il sottoselect dall’array. Nessuno schema parziale rimasto.

## Lettura/scrittura: fonti uniche
`PERMESSI_NOTE_PREVENTIVO` e funzioni TS in `src/lib/note-preventivo.ts`; gemelli SQL sotto. Ruoli lettura: amministratore/store_manager globali; preventivi_manage/write/read/showroom/responsabile_showroom limitati alla linea abilitata, come chiarito da Andrea. Inserimento e gestione secondo le regole originali; `creato_da=auth.uid()` obbligatorio nell’INSERT. Nessun FK ad auth.users. Autore nullable come richiesto. Le operazioni API non modificano autore/linea in UPDATE e impostano aggiornato_da.

## Trasformazione ordine: impronte, diff e ACL
- Prima: `b68b4cf59084abd7ba159960fda0cc84`.
- Dopo, verificato sul database: `803ae053b9e56e5f1678159cfc2a3064`.
- Firma invariata: `(p_preventivo_id uuid, p_selezione jsonb) RETURNS uuid`.
- ACL prima e dopo: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; anon EXECUTE=false.
- Nessun cambiamento a gate, lock, selezione, righe, calcoli, stati, note interne o numerazione. La migrazione usa un DO DDL vincolato alle due impronte per sostituire le sole due righe; **nessun SQL dinamico aggiunto alla funzione operativa**.

```diff
--- prima
+++ dopo
@@ -39,10 +39,10 @@
       -- FM75: l'ordine conserva la linea del preventivo; ometterla farebbe scattare il default 'sistema_made'.
       INSERT INTO public.preventivi (
         tipo, numero, data, cliente_id, agente_codice, cantiere_id, filiale,
-        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di, regime_iva, linea, store_id, listino_rif, macrocategoria_rif, categoria_rif, lead_id
+        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di, regime_iva, linea, store_id, listino_rif, macrocategoria_rif, categoria_rif, lead_id, note_cliente
       ) VALUES (
         'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
-        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL, v_prev.regime_iva, v_prev.linea, v_prev.store_id, v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif, v_prev.lead_id
+        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL, v_prev.regime_iva, v_prev.linea, v_prev.store_id, v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif, v_prev.lead_id, v_prev.note_cliente
       ) RETURNING id INTO v_ordine_id;
       EXIT;
     EXCEPTION WHEN unique_violation THEN
```

## Test
### TypeScript
`bun test`: **1431 pass, 0 fail**, 172 file, 4692 aspettative (suite finale dopo gli ultimi cambi applicativi).
19 test nuovi: ruoli/linee/anon, proprietario e gestione altrui, testo vuoto/non vuoto, titolo 120/121 e campi obbligatori, API nuova/aggiorna/autore/errore/eliminazione senza falso successo, duplica/alternativa effettive con API intercettata, PDF reali jsPDF per tutte le combinazioni e note lunghe.

### SQL con impersonazione, BEGIN/ROLLBACK
`tests/sql/fm98-note-cliente.sql` eseguito in **clone PostgreSQL locale isolato** (schema `fm96-clone-base`, helper auth/MFA reali, `auth_linee_abilitate`, numeratore reale, riepilogo IVA e RPC verbatim, migrazioni 0273/0274).
- 13 impersonazioni: amministratore, preventivi_write con/senza linea, responsabile_showroom con/senza linea, store_manager, direzione senza preventivi, showroom con/senza linea, preventivi_read con/senza linea, preventivi_manage con/senza linea.
- SELECT/INSERT/UPDATE/DELETE altrui e gestione delle proprie note; rifiuto autore falso, titolo 121/vuoto, testo vuoto; MFA amministratore aal1 nega lettura; anon nega tabella e helper.
- Trasformazione ordine copia il testo multilinea e non modifica note cliente/interne origine.
- Transazione conclusa con **ROLLBACK**. Il gate `auth_vede_preventivo_id` del clone usa la matrice fixture, come documentato dal clone preesistente; il resto della RPC è verbatim.
- **Non eseguito sul database ospitato**: strumenti di lettura non consentono impersonazione/esecuzione e il canale scrittura è solo dati. Nessun ampliamento di privilegi per eseguire il test.

### PDF e raster
Salvati i PDF precedenti prima di toccare stampa e poi prodotti quelli finali con gli stessi dati sintetici e condizioni. `pdftoppm` a 100 dpi + confronto PIL per pagina: **0 pixel diversi**, 8 coppie × 2 pagine = 16 confronti.
| Scenario | Ufficiale | Proposta rapida |
|---|---|---|
| Sistema MADE | identico | identico |
| Showroom | identico | identico |
| Ordine | identico | identico |
| IVA agevolata 10 beni significativi | identico | identico |
Test aggiuntivo null/stringa vuota/spazi con confronto del PDF normalizzando soltanto ID casuale e data creazione. Con note: ordine Totale → Note → Condizioni, note interne assenti. 250 righe = **7 pagine**, tutte le 250 conservate; numerazione 1/7…7/7 e condizioni dopo note. Estrazione coordinate con pypdf conferma note fuori piede/banda; pagina di continuazione raster osservata. Le liste interne non stampano note.

### Playwright
Script conservato `tests/fm98-note-cliente.browser.py`, fixture `tests/fixtures/fm98-note-cliente.tsx`; pagina temporanea `/verifica-fm98-note` **rimossa** dopo il collaudo.
Dimensioni sequenziali: 320×812, 375×812, 390×844, 768×1024 touch, 1280×1800 e 1920×1080.
Verificati: blur su ordine, aggiunta con riga vuota, testo persistito e riletto nello stato locale, nuova nota, aggiornamento, modifica, ricerca testo, autore invariato, annullamento/conferma elimina, crescita textarea, dicitura note interne, showroom sola lettura senza inserimento o comandi per note altrui. Nessun overflow/errori pagina.
Screenshot osservati a 375 e 1280: Piede, Libreria, Salva, Elimina, note interne e sola lettura; foto conservate durante la sessione in `/tmp/browser/fm98-f3/` (non archiviate nel repository e non persistenti dopo riavvio sandbox).

## Limiti espliciti
`lovable auth-session --json --self` restituisce che non esiste account applicativo corrispondente al richiedente. **Flusso autenticato con salvataggio/rilettura sul database ospitato non verificato**; nessuna impersonazione di un collaboratore. UI e API verificate con risposte locali, SQL RLS verificato nel clone in ROLLBACK. Nessun invio email reale.
Verifica dati ospitati prima/dopo: 0 note nella libreria, 0 documenti con note_cliente non NULL; nessun dato di prova persistente.
Controllo compilazione automatica: `build OK` dopo modifiche applicative; verificato nuovamente dopo rimozione pagina temporanea.

## File toccati
- `drizzle/migrations/0273_fm98_note_cliente_libreria.sql`, `0274_fm98_note_libreria_privilegi_anon.sql`, snapshot/journal gestiti dallo strumento.
- `src/integrations/supabase/types.ts` rigenerato dallo strumento.
- `src/lib/note-preventivo.ts`, `src/lib/preventivi-api.ts`, `src/lib/pdf-export.ts`.
- `src/components/preventivatore/NoteClientePreventivo.tsx`, `PiedePreventivo.tsx`, `TestataPreventivo.tsx`.
- `src/routes/_app/preventivatore.$id.tsx` (collegamento al salvataggio comune); metadata già completi conservati.
- `tests/fm98-note-cliente.test.ts`, `tests/sql/fm98-note-cliente.sql`, `tests/fm98-note-cliente.browser.py`, `tests/fixtures/fm98-note-cliente.tsx`.
- `AGENTS.md`, `roadmap.md`, questo rapporto. Route temporanea e relativa modifica generata routeTree eliminate.

Nuova fonte unica segnalata al proprietario per `docs/regole/`: note-preventivo per libreria/permessi e drawNoteCliente per stampa cliente; i documenti di regole del proprietario non sono stati riscritti.

## Migrazioni verbatim (policy e funzioni comprese)
### 0273
```sql
ALTER TABLE public.preventivi ADD COLUMN note_cliente text NULL;

CREATE TABLE public.note_preventivo_libreria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linea public.linea_preventivo NOT NULL,
  titolo text NOT NULL CONSTRAINT note_libreria_titolo_valido CHECK (length(btrim(titolo)) BETWEEN 1 AND 120),
  testo text NOT NULL CONSTRAINT note_libreria_testo_valido CHECK (length(btrim(testo)) > 0),
  creato_da uuid DEFAULT auth.uid(),
  aggiornato_da uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_preventivo_libreria TO authenticated;
GRANT ALL ON public.note_preventivo_libreria TO service_role;
ALTER TABLE public.note_preventivo_libreria ENABLE ROW LEVEL SECURITY;
CREATE INDEX note_preventivo_libreria_linea_titolo ON public.note_preventivo_libreria (linea, titolo);
CREATE TRIGGER note_preventivo_libreria_updated_at BEFORE UPDATE ON public.note_preventivo_libreria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- FM98: gemelle di PERMESSI_NOTE_PREVENTIVO in src/lib/note-preventivo.ts.
-- Lettura della linea senza auth_ha_accesso_preventivi (showroom compreso).
CREATE OR REPLACE FUNCTION public.auth_legge_note_preventivo(_linea public.linea_preventivo)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'amministratore')
    OR public.has_role(auth.uid(), 'store_manager')
    OR ((public.has_role(auth.uid(), 'preventivi_manage')
      OR public.has_role(auth.uid(), 'preventivi_write')
      OR public.has_role(auth.uid(), 'preventivi_read')
      OR public.has_role(auth.uid(), 'showroom')
      OR public.has_role(auth.uid(), 'responsabile_showroom'))
      AND _linea = ANY((SELECT public.auth_linee_abilitate())::public.linea_preventivo[]))
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_legge_note_preventivo(public.linea_preventivo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_legge_note_preventivo(public.linea_preventivo) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_scrive_note_preventivo(_linea public.linea_preventivo, _autore uuid, _azione text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND _azione IN ('inserisci', 'modifica', 'elimina') AND (
    public.has_role(auth.uid(), 'amministratore')
    OR (_linea = ANY((SELECT public.auth_linee_abilitate())::public.linea_preventivo[]) AND (
      public.has_role(auth.uid(), 'preventivi_manage')
      OR public.has_role(auth.uid(), 'responsabile_showroom')
      OR CASE WHEN _azione = 'inserisci'
        THEN public.has_role(auth.uid(), 'preventivi_write')
        ELSE _autore = auth.uid()
      END
    ))
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_scrive_note_preventivo(public.linea_preventivo, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_scrive_note_preventivo(public.linea_preventivo, uuid, text) TO authenticated, service_role;

CREATE POLICY "Secondo fattore (FM44)" ON public.note_preventivo_libreria AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY note_libreria_select ON public.note_preventivo_libreria FOR SELECT TO authenticated USING (public.auth_legge_note_preventivo(linea));
CREATE POLICY note_libreria_insert ON public.note_preventivo_libreria FOR INSERT TO authenticated WITH CHECK (creato_da = (SELECT auth.uid()) AND public.auth_scrive_note_preventivo(linea, creato_da, 'inserisci'));
CREATE POLICY note_libreria_update ON public.note_preventivo_libreria FOR UPDATE TO authenticated USING (public.auth_scrive_note_preventivo(linea, creato_da, 'modifica')) WITH CHECK (public.auth_scrive_note_preventivo(linea, creato_da, 'modifica'));
CREATE POLICY note_libreria_delete ON public.note_preventivo_libreria FOR DELETE TO authenticated USING (public.auth_scrive_note_preventivo(linea, creato_da, 'elimina'));

-- Copia chirurgica: l'impronta protegge da qualsiasi cambiamento intercorso.
-- Solo DDL della migrazione, nessun SQL dinamico aggiunto alla RPC operativa.
DO $fm98$
DECLARE originale text; modificata text;
BEGIN
  originale := pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure);
  IF md5(originale) <> 'b68b4cf59084abd7ba159960fda0cc84' THEN
    RAISE EXCEPTION 'Definizione trasformazione ordine diversa da quella verificata';
  END IF;
  modificata := replace(replace(originale,
    E'categoria_rif, lead_id\n', E'categoria_rif, lead_id, note_cliente\n'),
    E'v_prev.categoria_rif, v_prev.lead_id\n', E'v_prev.categoria_rif, v_prev.lead_id, v_prev.note_cliente\n');
  IF md5(modificata) <> '803ae053b9e56e5f1678159cfc2a3064' THEN
    RAISE EXCEPTION 'Diff trasformazione ordine diverso dalla sola copia note cliente';
  END IF;
  EXECUTE modificata;
END;
$fm98$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid, jsonb) TO authenticated, service_role;
```
### 0274
```sql
REVOKE ALL ON TABLE public.note_preventivo_libreria FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.note_preventivo_libreria FROM authenticated;
```

## Definizione finale RPC verbatim verificata per impronta
```sql
CREATE OR REPLACE FUNCTION public.trasforma_preventivo_in_ordine(p_preventivo_id uuid, p_selezione jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev public.preventivi%ROWTYPE;
  v_anno integer;
  v_suffix text;
  v_num integer;
  v_numero text;
  v_ordine_id uuid;
  v_tentativi integer := 0;
  v_blocco jsonb;
  v_riga jsonb;
  v_src_blocco public.blocchi_preventivo%ROWTYPE;
  v_src_riga public.righe_preventivo%ROWTYPE;
  v_new_blocco_id uuid;
  v_qta numeric;
  v_residuo numeric;
  v_ratio numeric;
  v_ord integer;
BEGIN
  IF NOT (public.auth_mfa_ok() AND public.auth_vede_preventivo_id(p_preventivo_id)) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT * INTO v_prev FROM public.preventivi WHERE id = p_preventivo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preventivo non trovato'; END IF;
  IF v_prev.tipo <> 'preventivo' THEN RAISE EXCEPTION 'Il documento non è un preventivo'; END IF;
  IF v_prev.chiuso_at IS NOT NULL THEN RAISE EXCEPTION 'Il preventivo è chiuso: non è più trasformabile in ordine'; END IF;
  v_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_suffix := lpad((v_anno % 100)::text, 2, '0');
  LOOP
    v_tentativi := v_tentativi + 1;
    BEGIN
      v_num := public.prossimo_numero_ordine(v_anno);
      v_numero := 'ORD-' || v_num::text || '/' || v_suffix;
      -- FM75: l'ordine conserva la linea del preventivo; ometterla farebbe scattare il default 'sistema_made'.
      INSERT INTO public.preventivi (
        tipo, numero, data, cliente_id, agente_codice, cantiere_id, filiale,
        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di, regime_iva, linea, store_id, listino_rif, macrocategoria_rif, categoria_rif, lead_id, note_cliente
      ) VALUES (
        'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL, v_prev.regime_iva, v_prev.linea, v_prev.store_id, v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif, v_prev.lead_id, v_prev.note_cliente
      ) RETURNING id INTO v_ordine_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tentativi >= 5 THEN RAISE EXCEPTION 'Impossibile generare un numero ordine univoco'; END IF;
    END;
  END LOOP;
  INSERT INTO public.preventivi_note (preventivo_id, titolo, testo, ordine)
    SELECT v_ordine_id, titolo, testo, ordine FROM public.preventivi_note WHERE preventivo_id = v_prev.id;
  v_ord := 0;
  FOR v_blocco IN SELECT * FROM jsonb_array_elements(COALESCE(p_selezione, '[]'::jsonb))
  LOOP
    SELECT * INTO v_src_blocco FROM public.blocchi_preventivo WHERE id = (v_blocco->>'blocco_id')::uuid AND preventivo_id = v_prev.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Blocco % non appartiene al preventivo', v_blocco->>'blocco_id'; END IF;
    INSERT INTO public.blocchi_preventivo (preventivo_id, descrizione, rif_capitolato, note_tecniche, ordine, kit_id, um_base)
    VALUES (v_ordine_id, v_src_blocco.descrizione, v_src_blocco.rif_capitolato, v_src_blocco.note_tecniche, v_ord, v_src_blocco.kit_id, v_src_blocco.um_base) RETURNING id INTO v_new_blocco_id;
    v_ord := v_ord + 1;
    FOR v_riga IN SELECT * FROM jsonb_array_elements(COALESCE(v_blocco->'righe', '[]'::jsonb))
    LOOP
      SELECT * INTO v_src_riga FROM public.righe_preventivo WHERE id = (v_riga->>'riga_id')::uuid AND blocco_id = v_src_blocco.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Riga % non appartiene al blocco', v_riga->>'riga_id'; END IF;
      v_qta := COALESCE((v_riga->>'quantita')::numeric, 0);
      IF v_qta <= 0 THEN CONTINUE; END IF;
      v_residuo := COALESCE(v_src_riga.quantita, 0) - COALESCE(v_src_riga.qta_ordinata, 0);
      IF v_qta > v_residuo THEN RAISE EXCEPTION 'Quantità richiesta (%) superiore al residuo (%) per la riga %', v_qta, v_residuo, v_src_riga.id; END IF;
      v_ratio := CASE WHEN COALESCE(v_src_riga.quantita, 0) > 0 THEN v_qta / v_src_riga.quantita ELSE 0 END;
      -- FM75 F4a: linea showroom conserva la descrizione salvata (varianti); altre linee ripristinano la descrizione Gamma.
      -- Quantità/prezzo già UM1: nessuna conversione, si copia solo la scelta di presentazione.
      INSERT INTO public.righe_preventivo (
        blocco_id, tipo_riga, articolo_id, descrizione, um, incidenza, quantita, qta_ordinata,
        prezzo_unit, sconto_perc, segno, importo, costo, ricarico, margine, vendita, peso,
        ordine, riga_origine_id, articolo_codice, sconti_gamma, maggiorazione_perc, um_scelta, stampabile, bene_significativo, aliquota_iva,
        fornitore_id, marca, codice_articolo_fornitore, listino_fornitore, leva_prezzo, fonte_prezzo, codice_famiglia, codice_sottofamiglia, um2, fattore_conversione, acq_sc1, acq_sc2, acq_sc3, acq_magg_perc, acq_magg_euro
      ) VALUES (
        v_new_blocco_id, v_src_riga.tipo_riga, v_src_riga.articolo_id, CASE WHEN v_src_riga.articolo_codice IS NOT NULL AND v_prev.linea IS DISTINCT FROM 'showroom' THEN (SELECT a.descrizione FROM public.articoli_gamma a WHERE a.codice = v_src_riga.articolo_codice) ELSE v_src_riga.descrizione END, v_src_riga.um,
        v_src_riga.incidenza, v_qta, 0,
        v_src_riga.prezzo_unit, v_src_riga.sconto_perc, v_src_riga.segno,
        ROUND(COALESCE(v_src_riga.importo, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.costo, 0) * v_ratio, 2),
        v_src_riga.ricarico, v_src_riga.margine, ROUND(COALESCE(v_src_riga.vendita, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.peso, 0) * v_ratio, 3),
        v_src_riga.ordine, v_src_riga.id, v_src_riga.articolo_codice, v_src_riga.sconti_gamma, v_src_riga.maggiorazione_perc, v_src_riga.um_scelta, v_src_riga.stampabile, v_src_riga.bene_significativo, v_src_riga.aliquota_iva,
        v_src_riga.fornitore_id, v_src_riga.marca, v_src_riga.codice_articolo_fornitore, v_src_riga.listino_fornitore, v_src_riga.leva_prezzo, v_src_riga.fonte_prezzo, v_src_riga.codice_famiglia, v_src_riga.codice_sottofamiglia, v_src_riga.um2, v_src_riga.fattore_conversione, v_src_riga.acq_sc1, v_src_riga.acq_sc2, v_src_riga.acq_sc3, v_src_riga.acq_magg_perc, v_src_riga.acq_magg_euro
      );
    END LOOP;
  END LOOP;
  UPDATE public.blocchi_preventivo b SET importo = COALESCE(s.tot, 0)
    FROM (SELECT r.blocco_id, SUM(COALESCE(r.importo, 0)) AS tot FROM public.righe_preventivo r GROUP BY r.blocco_id) s
   WHERE b.id = s.blocco_id AND b.preventivo_id = v_ordine_id;
  -- FM75 F3d: IVA e totale dal gemello SQL calcola_riepilogo_iva (fonte unica TS totaliDocumento).
  UPDATE public.preventivi p SET totale_imponibile = t.imp, iva_importo = t.iva, totale = t.imp + t.iva
    FROM (SELECT COALESCE(SUM(x.imponibile), 0) AS imp, COALESCE(SUM(x.iva), 0) AS iva FROM public.calcola_riepilogo_iva(v_ordine_id) x) t
   WHERE p.id = v_ordine_id;
  IF v_prev.stato IS DISTINCT FROM 'ordinato' THEN
    UPDATE public.preventivi SET stato_prima_ordine = stato, stato = 'ordinato' WHERE id = v_prev.id;
  END IF;
  RETURN v_ordine_id;
END;
$function$

```
