-- Stessa funzione di produzione: prova annullata, senza cambiare ruoli/permessi.
-- Nella sandbox il ruolo tecnico non può chiamare la RPC: eseguita anche sul clone SQL isolato.
BEGIN;
DO $test$
DECLARE
  v_lead uuid;
  v_prev uuid;
  v_blocco uuid;
  v_riga uuid;
  v_ordine uuid;
  v_num text := gen_random_uuid()::text;
BEGIN
  INSERT INTO public.lead (ragione_sociale) VALUES ('FM95 SOLO ROLLBACK') RETURNING id INTO v_lead;
  INSERT INTO public.preventivi (tipo,numero,lead_id,cliente_id,linea,stato,store_id,listino_rif,macrocategoria_rif,categoria_rif)
    VALUES ('preventivo','FM95-P-'||v_num,v_lead,NULL,'showroom','inviato','00000000-0000-0000-0000-000000000095',20,'01','02') RETURNING id INTO v_prev;
  INSERT INTO public.blocchi_preventivo (preventivo_id,descrizione,ordine) VALUES (v_prev,'Prova',0) RETURNING id INTO v_blocco;
  INSERT INTO public.righe_preventivo (blocco_id,tipo_riga,descrizione,ordine,quantita,qta_ordinata,prezzo_unit,importo,costo,codice_famiglia,codice_sottofamiglia,um,um2,fattore_conversione)
    VALUES (v_blocco,'manuale','Prova',0,10,0,20,200,100,'01','02','MQ','NR',1.44) RETURNING id INTO v_riga;
  v_ordine := public.trasforma_preventivo_in_ordine(v_prev,jsonb_build_array(jsonb_build_object('blocco_id',v_blocco,'righe',jsonb_build_array(jsonb_build_object('riga_id',v_riga,'quantita',4)))));
  IF NOT EXISTS (SELECT 1 FROM public.preventivi WHERE id=v_ordine AND tipo='ordine' AND lead_id=v_lead AND cliente_id IS NULL AND store_id='00000000-0000-0000-0000-000000000095' AND listino_rif=20 AND macrocategoria_rif='01' AND categoria_rif='02') THEN
    RAISE EXCEPTION 'Copia destinatario/sede/riferimenti errata';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.preventivi WHERE id=v_prev AND stato='ordinato' AND stato_prima_ordine='inviato') THEN RAISE EXCEPTION 'Stato origine cambiato'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.righe_preventivo r JOIN public.blocchi_preventivo b ON b.id=r.blocco_id WHERE b.preventivo_id=v_ordine AND r.quantita=4 AND r.prezzo_unit=20 AND r.codice_famiglia='01' AND r.codice_sottofamiglia='02' AND r.um2='NR' AND r.fattore_conversione=1.44) THEN RAISE EXCEPTION 'Copia righe FM94 cambiata'; END IF;
  RAISE NOTICE 'PASS: RPC copia lead, sede, riferimenti e righe; stato origine Ordinato';
END;
$test$;
ROLLBACK;