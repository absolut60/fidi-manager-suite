# FM97 — Prezzo di acquisto manuale

## Migrazione e dati
Applicata `drizzle/migrations/0271_fm97_acquisto_manuale.sql`: cinque colonne numeric nullable, nessun default/backfill, commenti espliciti sulle percentuali e sugli euro per UM1. Firma trasformazione invariata; EXECUTE negato a PUBLIC/anon, mantenuto authenticated/service_role.

Dati verificati realmente: 106 righe complessive, 10 tipo manuale (6 con costo, 3 con listino), non i 21/2 indicati nel contesto iniziale. Nessun dato modificato: impronta delle colonne originali prima/dopo `ee4bd7b5f7f25f8c0d0a973088b32828`; tutte le cinque colonne nuove NULL. Tre policy: impronta invariata `715b7f2f2513db0040ae99a995dd78e7`; tre trigger: impronta invariata `d861b527d956762ed4f55f52db2bcc41`, compreso il blocco Gamma.

## Confronto della trasformazione
Definizione letta sul database prima e dopo: aggiunti solo i cinque nomi e i cinque valori v_src_riga, niente altre differenze. La migrazione verifica l'md5 precedente prima di sostituire e abortisce se diverso/incompleto.

- MD5 prima: `561ad7e3d27bb97b3113821e6d36b738`
- MD5 dopo: `b68b4cf59084abd7ba159960fda0cc84`

```diff
--- prima
+++ dopo
@@ -74,7 +74,7 @@
         blocco_id, tipo_riga, articolo_id, descrizione, um, incidenza, quantita, qta_ordinata,
         prezzo_unit, sconto_perc, segno, importo, costo, ricarico, margine, vendita, peso,
         ordine, riga_origine_id, articolo_codice, sconti_gamma, maggiorazione_perc, um_scelta, stampabile, bene_significativo, aliquota_iva,
-        fornitore_id, marca, codice_articolo_fornitore, listino_fornitore, leva_prezzo, fonte_prezzo, codice_famiglia, codice_sottofamiglia, um2, fattore_conversione
+        fornitore_id, marca, codice_articolo_fornitore, listino_fornitore, leva_prezzo, fonte_prezzo, codice_famiglia, codice_sottofamiglia, um2, fattore_conversione, acq_sc1, acq_sc2, acq_sc3, acq_magg_perc, acq_magg_euro
       ) VALUES (
         v_new_blocco_id, v_src_riga.tipo_riga, v_src_riga.articolo_id, CASE WHEN v_src_riga.articolo_codice IS NOT NULL AND v_prev.linea IS DISTINCT FROM 'showroom' THEN (SELECT a.descrizione FROM public.articoli_gamma a WHERE a.codice = v_src_riga.articolo_codice) ELSE v_src_riga.descrizione END, v_src_riga.um,
         v_src_riga.incidenza, v_qta, 0,
@@ -82,7 +82,7 @@
         ROUND(COALESCE(v_src_riga.importo, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.costo, 0) * v_ratio, 2),
         v_src_riga.ricarico, v_src_riga.margine, ROUND(COALESCE(v_src_riga.vendita, 0) * v_ratio, 2), ROUND(COALESCE(v_src_riga.peso, 0) * v_ratio, 3),
         v_src_riga.ordine, v_src_riga.id, v_src_riga.articolo_codice, v_src_riga.sconti_gamma, v_src_riga.maggiorazione_perc, v_src_riga.um_scelta, v_src_riga.stampabile, v_src_riga.bene_significativo, v_src_riga.aliquota_iva,
-        v_src_riga.fornitore_id, v_src_riga.marca, v_src_riga.codice_articolo_fornitore, v_src_riga.listino_fornitore, v_src_riga.leva_prezzo, v_src_riga.fonte_prezzo, v_src_riga.codice_famiglia, v_src_riga.codice_sottofamiglia, v_src_riga.um2, v_src_riga.fattore_conversione
+        v_src_riga.fornitore_id, v_src_riga.marca, v_src_riga.codice_articolo_fornitore, v_src_riga.listino_fornitore, v_src_riga.leva_prezzo, v_src_riga.fonte_prezzo, v_src_riga.codice_famiglia, v_src_riga.codice_sottofamiglia, v_src_riga.um2, v_src_riga.fattore_conversione, v_src_riga.acq_sc1, v_src_riga.acq_sc2, v_src_riga.acq_sc3, v_src_riga.acq_magg_perc, v_src_riga.acq_magg_euro
       );
     END LOOP;
   END LOOP;
```

<!-- DEFINIZIONE_FINALE -->
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
        fascia_listino, stato, tipo_doc, iva_perc, preventivo_origine_id, titolo, condizione_pagamento_cod, alternativa_di, regime_iva, linea, store_id, listino_rif, macrocategoria_rif, categoria_rif, lead_id
      ) VALUES (
        'ordine', v_numero, CURRENT_DATE, v_prev.cliente_id, v_prev.agente_codice, v_prev.cantiere_id, v_prev.filiale,
        v_prev.fascia_listino, 'bozza', v_prev.tipo_doc, v_prev.iva_perc, v_prev.id, v_prev.titolo, v_prev.condizione_pagamento_cod, NULL, v_prev.regime_iva, v_prev.linea, v_prev.store_id, v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif, v_prev.lead_id
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

## Fonte unica e file
- `src/lib/riga-preventivo.ts`: `nettoAcquistoGamma` delega cascata/maggiorazione alla formula canonica `prezzoNettoRiga` e aggiunge gli euro UM1; `preparaAcquistoManuale` centralizza solo-listino/solo-costo e condizioni; `precompilaScontiAcquisto` propone solo gli slot vuoti.
- Nessun netto d'acquisto TS preesistente trovato: scheda articolo/listini leggono il `costo_acquisto` già importato da Gamma, non lo calcolano. Queste letture restano invariate.
- `ArticoloInDefinizioneDialog.tsx`: riquadro acquisto prima della vendita, listino/sconti/maggiorazioni/costo netto; costo calcolato con listino, editabile senza; `patchCosto` sempre tramite `rigaInUnita`. Sconti fornitore solo acquisto, avviso oltre tre. Kit `soloAnagrafica` conserva percorso precedente.
- `esportazione-gamma.ts`: manuali inviano listino e condizioni di acquisto, ripiego costo unitario per le vecchie righe; avviso `costo_manuale_diverso` oltre 0,0001, senza cambiare raccomandazioni/bloccanti/prezzi vendita/somme.
- `preventivi-api.ts`: anche la duplicazione conserva i nuovi campi, evitando perdita delle condizioni salvate. Salvataggio generico e lettura `*` già compatibili.
- `AGENTS.md`: fonte unica acquisto e patch UM1 documentate. Tipi rigenerati automaticamente dalla migrazione.

## Verifiche
- **1.382 test TS superati, 0 fallimenti, 4.569 assertions**. Dodici nuovi test `tests/fm97-acquisto-manuale.test.ts`: formula 100 × 0,90 × 0,95 × 0,98 × 1,03 + 1,5 = 87,8037; solo listino, solo costo, zero, riapertura e patch totale, vecchio costo invariato, sconti fornitore solo slot acquisto vuoti/oltre tre, export manuale completo e vendita invariata, fallback storico, avviso oltre 0,0001 e nessun avviso esattamente alla soglia, definizione SQL inversa byte-identica tramite MD5.
- `tests/sql/fm97-acquisto-manuale.sql` eseguito sul clone PostgreSQL locale vuoto (schema fixture FM96, dipendenze di numerazione/IVA sintetiche, definizione originale reale e migrazione 0271 applicate): copia delle cinque condizioni nella quantità parziale d'ordine, listino UM1 invariato e costo proporzionale verificati. ROLLBACK, zero preventivi e zero righe rimasti. Non è una prova autenticata sul database reale.
- Conservato **l'arrotondamento SQL preesistente del costo a due decimali nella trasformazione**: nell'esempio metà di 878,037 diventa 439,02, non 439,0185. Nessuna correzione collaterale; l'avviso `costo_manuale_diverso` può pertanto segnalare questa differenza sugli ordini. Il salvataggio del preventivo continua a usare costo totale a quattro decimali via `patchCosto`.
- `tests/fm97-acquisto-manuale.browser.py`: finestra reale mediante route temporanea, risposte fornitore locali, a **375×812, 768×1024 touch, 1280×1800**. Percorso vecchio costo 250/10 → costo unitario 25, listino 100 → costo 100, condizioni → 87,8037, salvataggio totale 878,037, riapertura campi, solo costo → listino 25/condizioni NULL, fornitore con [10,5,2,1] e slot 1 già 7 → [7,5,2] con avviso, vendita sempre senza sconti, modalità kit senza nuovo riquadro.
- Screenshot acquisto/vendita/costo netto/sconti fornitore acquisiti e ispezionati alle tre larghezze in `/tmp/browser/fm97-acquisto`; nessun overflow finestra/pagina o errore runtime; prezzi acquisto a quattro decimali, campi telefono in una colonna e tablet/PC compatti. Route temporanea rimossa. Nessuna scrittura API reale durante la prova: callback locale per salvataggio/rilettura.
- Compilazione automatica senza errori. Permessi e trigger riletti: `blocca_ordine_esportato_gamma` protegge qualsiasi UPDATE della riga indipendentemente dalle colonne, quindi copre anche i cinque campi nuovi. La trasformazione conserva firma/gate; confronto integrale e MD5 sopra.

## Limiti e nuove fonti
La verifica autenticata persistita resta indisponibile (account personale non corrispondente nell'app, già verificato nelle fette precedenti): salvataggio/riapertura UI con dati locali e copia SQL su clone, nessun dato reale modificato. La nuova fonte unica acquisto è documentata in root AGENTS.md; `docs/regole/prezzi-preventivo.md` contiene ancora la vecchia precompilazione vendita del fornitore e deve essere aggiornato dal proprietario alla decisione FM97, senza cambiare le leve di vendita.

Nessuna pubblicazione, nessuna modifica a PreventiviListView, ordine colonne o nome file Gamma; file storici non modificati.
