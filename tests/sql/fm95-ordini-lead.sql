-- Prova reale di CHECK e riaggancio, sempre annullata. Numeri espliciti: nessun consumo contatori.
-- Usa il ruolo tecnico della sandbox; non afferma di verificare RLS/sessione amministratore.
BEGIN;
DO $test$
DECLARE
  v_lead uuid;
  v_cliente uuid;
  v_prev uuid;
  v_ordine uuid;
  v_num text := gen_random_uuid()::text;
BEGIN
  SELECT cliente_id INTO v_cliente FROM public.preventivi WHERE numero='ORD-104/26';
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'Cliente di prova non disponibile'; END IF;
  INSERT INTO public.lead (ragione_sociale, codice_sdi) VALUES ('FM95 SOLO ROLLBACK', 'ABC1234') RETURNING id INTO v_lead;
  INSERT INTO public.preventivi (tipo, numero, lead_id, cliente_id, listino_rif, macrocategoria_rif, categoria_rif)
    VALUES ('preventivo','FM95-P-'||v_num,v_lead,NULL,10,'01','01') RETURNING id INTO v_prev;
  INSERT INTO public.preventivi (tipo, numero, lead_id, cliente_id, preventivo_origine_id, listino_rif, macrocategoria_rif, categoria_rif)
    SELECT 'ordine','FM95-O-'||v_num,lead_id,cliente_id,id,listino_rif,macrocategoria_rif,categoria_rif
    FROM public.preventivi WHERE id=v_prev RETURNING id INTO v_ordine;
  IF (SELECT lead_id FROM public.preventivi WHERE id=v_ordine) IS DISTINCT FROM v_lead THEN RAISE EXCEPTION 'Lead ordine non copiato'; END IF;
  BEGIN
    INSERT INTO public.preventivi (tipo,numero,cliente_id,lead_id)
      VALUES ('ordine','FM95-CHECK-'||v_num,v_cliente,v_lead);
    RAISE EXCEPTION 'CHECK: cliente e lead insieme accettati';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS: CHECK vieta cliente e lead insieme anche negli ordini';
  IF NOT has_table_privilege(current_user,'public.lead','UPDATE') THEN
    RAISE NOTICE 'SKIP riaggancio live: ruolo tecnico senza UPDATE lead; eseguire con ruolo autorizzato o nel database isolato';
    RETURN;
  END IF;
  UPDATE public.lead SET cliente_id=v_cliente WHERE id=v_lead;
  IF (SELECT count(*) FROM public.preventivi WHERE id IN (v_prev,v_ordine) AND cliente_id=v_cliente AND lead_id IS NULL AND lead_origine_id=v_lead) <> 2 THEN
    RAISE EXCEPTION 'Riaggancio: origine/cliente/lead non coerenti su entrambi i documenti';
  END IF;
  IF (SELECT count(*) FROM public.preventivi WHERE id IN (v_prev,v_ordine) AND listino_rif=10 AND macrocategoria_rif='01' AND categoria_rif='01') <> 2 THEN
    RAISE EXCEPTION 'Riaggancio ha cambiato condizioni commerciali';
  END IF;
  RAISE NOTICE 'PASS: CHECK cliente/lead e riaggancio su preventivo e ordine, riferimenti conservati';
END;
$test$;
ROLLBACK;