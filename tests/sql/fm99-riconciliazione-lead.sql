-- FM99 fetta 1: verifica riconciliazione lead -> cliente. Tutto in un blocco che termina
-- con RAISE EXCEPTION: nessuna modifica resta nel database (rollback forzato).
DO $t$
DECLARE
  A uuid := '30c9d579-76c3-4312-b47e-3f9f4680fc40';  -- amministratore attivo
  U uuid := 'cb58438e-6f9c-4602-ae67-170615802a83';  -- utente attivo senza accesso al modulo lead
  IMP uuid := (SELECT id FROM public.importazioni WHERE eseguita_da IS NOT NULL ORDER BY created_at DESC LIMIT 1);
  out text[] := '{}';
  L0 uuid; L1 uuid; L2 uuid; L3 uuid; L4 uuid; C0 uuid; C1 uuid; C2a uuid; C2b uuid; C3 uuid; C4 uuid; P1 uuid;
  res jsonb; v record; n int; ok boolean;
  pre_lead int := (SELECT count(*) FROM public.lead WHERE cliente_id IS NOT NULL);
BEGIN
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C0', '99999999900', 'FM99C0') RETURNING id INTO C0;
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C1', '99999999901', 'FM99C1') RETURNING id INTO C1;
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C2a', '99999999902', 'FM99C2A') RETURNING id INTO C2a;
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C2b', '99999999902', 'FM99C2B') RETURNING id INTO C2b;
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C3', '99999999903', 'FM99C3') RETURNING id INTO C3;
  INSERT INTO public.clienti (ragione_sociale, partita_iva, codice_gestionale) VALUES ('FM99 C4', '102730', 'FM99C4') RETURNING id INTO C4;
  INSERT INTO public.lead (ragione_sociale, partita_iva, created_by) VALUES ('FM99 L0', '11111111100', U) RETURNING id INTO L0;
  INSERT INTO public.lead (ragione_sociale, partita_iva, created_by, stato) VALUES ('FM99 L1', 'IT 99999999901', U, 'perso') RETURNING id INTO L1;
  INSERT INTO public.lead (ragione_sociale, partita_iva, created_by) VALUES ('FM99 L2', '99999999902', A) RETURNING id INTO L2;
  INSERT INTO public.lead (ragione_sociale, codice_fiscale, created_by) VALUES ('FM99 L3', ' 99999999903 ', U) RETURNING id INTO L3;
  INSERT INTO public.lead (ragione_sociale, partita_iva, created_by) VALUES ('FM99 L4', '102730', U) RETURNING id INTO L4;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  INSERT INTO public.preventivi (lead_id) VALUES (L1) RETURNING id INTO P1;

  -- 1. collega_lead_a_cliente invariata
  PERFORM set_config('request.jwt.claims', json_build_object('sub', U, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.collega_lead_a_cliente(L0, C0); out := out || 'T1a FAIL'; EXCEPTION WHEN OTHERS THEN out := out || ('T1a ' || SQLERRM); END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.collega_lead_a_cliente(gen_random_uuid(), C0); EXCEPTION WHEN OTHERS THEN out := out || ('T1b ' || SQLERRM); END;
  BEGIN PERFORM public.collega_lead_a_cliente(L0, gen_random_uuid()); EXCEPTION WHEN OTHERS THEN out := out || ('T1c ' || SQLERRM); END;
  res := public.collega_lead_a_cliente(L0, C0);
  BEGIN PERFORM public.collega_lead_a_cliente(L0, C0); EXCEPTION WHEN OTHERS THEN out := out || ('T1d ' || SQLERRM); END;
  RESET ROLE;
  SELECT l.conversione_tipo, l.convertito_da = A AS da, l.cliente_id = C0 AS cli, (SELECT nota FROM public.lead_storico s WHERE s.lead_id = L0 ORDER BY created_at DESC LIMIT 1) nota INTO v FROM public.lead l WHERE l.id = L0;
  out := out || ('T1e ritorno=' || res::text || ' tipo=' || v.conversione_tipo || ' op=' || v.da || ' cli=' || v.cli || ' nota=' || v.nota);

  -- 2. motore (import reale come origine: operatore = eseguita_da)
  res := public.riconcilia_lead_clienti(IMP, NULL);
  out := out || ('T2 motore=' || (res - 'riconciliazioni')::text);
  SELECT l.conversione_tipo, l.stato, l.cliente_id = C1 AS cli, l.convertito_da = (SELECT eseguita_da FROM public.importazioni WHERE id = IMP) AS op INTO v FROM public.lead l WHERE l.id = L1;
  out := out || ('T2a L1 tipo=' || v.conversione_tipo || ' stato=' || v.stato || ' cli=' || v.cli || ' op=' || v.op);
  SELECT p.cliente_id = C1 AS cli, p.lead_origine_id = L1 AS orig, p.lead_id IS NULL AS sl INTO v FROM public.preventivi p WHERE p.id = P1;
  out := out || ('T2b preventivo cli=' || v.cli || ' origine=' || v.orig || ' lead_null=' || v.sl);
  SELECT esito, chiave, cliente_codice, jsonb_array_length(candidati) nc, nota, importazione_id = IMP AS imp INTO v FROM public.lead_riconciliazioni WHERE lead_id = L1;
  out := out || ('T2c L1 ' || v.esito || ' ' || v.chiave || ' ' || v.cliente_codice || ' cand=' || v.nc || ' imp=' || v.imp || ' nota=' || v.nota);
  -- il trigger di raggruppamento fonde le notifiche dello stesso tipo per utente: si contano i destinatari
  SELECT count(*) INTO n FROM (SELECT U AS uid UNION SELECT ur.user_id FROM public.user_roles ur JOIN public.profili p ON p.id = ur.user_id AND p.attivo WHERE ur.role = 'amministratore') x
   WHERE NOT EXISTS (SELECT 1 FROM public.notifiche nt WHERE nt.tipo = 'lead_riconciliato' AND nt.user_id = x.uid);
  out := out || ('T2d destinatari attesi (creatore+admin attivi) senza notifica=' || n
     || ' creatore=' || EXISTS (SELECT 1 FROM public.notifiche WHERE tipo = 'lead_riconciliato' AND user_id = U AND metadata->>'lead_id' = L1::text)
     || ' raggruppate_admin=' || coalesce((SELECT max(conteggio) FROM public.notifiche WHERE tipo = 'lead_riconciliato' AND user_id = A), 0));
  SELECT esito, chiave, jsonb_array_length(candidati) nc, cliente_id IS NULL AS sc INTO v FROM public.lead_riconciliazioni WHERE lead_id = L2;
  out := out || ('T2e L2 ' || v.esito || ' ' || v.chiave || ' cand=' || v.nc || ' senza_cliente=' || v.sc || ' lead_libero=' || (SELECT cliente_id IS NULL FROM public.lead WHERE id = L2));
  SELECT count(*) INTO n FROM public.notifiche WHERE tipo = 'lead_da_riconciliare' AND metadata->>'lead_id' = L2::text;
  out := out || ('T2f notifiche L2=' || n || ' (solo admin attivi) messaggio=' || (SELECT messaggio FROM public.notifiche WHERE tipo = 'lead_da_riconciliare' AND metadata->>'lead_id' = L2::text LIMIT 1));
  SELECT esito, chiave INTO v FROM public.lead_riconciliazioni WHERE lead_id = L3;
  out := out || ('T2g L3 (CF=PIVA) ' || v.esito || ' ' || v.chiave || ' cli=' || ((SELECT cliente_id FROM public.lead WHERE id = L3) = C3));
  out := out || ('T2h L4 segnaposto righe=' || (SELECT count(*) FROM public.lead_riconciliazioni WHERE lead_id = L4) || ' libero=' || (SELECT cliente_id IS NULL FROM public.lead WHERE id = L4));
  -- seconda esecuzione "Controlla ora": nessun doppione, riga aperta aggiornata
  res := public.riconcilia_lead_clienti(NULL, A);
  out := out || ('T2i seconda=' || (res - 'riconciliazioni')::text || ' righe_L2=' || (SELECT count(*) FROM public.lead_riconciliazioni WHERE lead_id = L2));

  -- 3. annullamento import_gamma
  PERFORM set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.annulla_conversione_lead(L1);
  RESET ROLE;
  out := out || ('T3 cliente_esiste=' || EXISTS (SELECT 1 FROM public.clienti WHERE id = C1)
     || ' riga=' || (SELECT esito || ' da_admin=' || (risolto_da = A) FROM public.lead_riconciliazioni WHERE lead_id = L1)
     || ' lead=' || (SELECT stato || '/' || coalesce(conversione_tipo, 'null') FROM public.lead WHERE id = L1)
     || ' preventivo_resta_al_cliente=' || (SELECT cliente_id = C1 FROM public.preventivi WHERE id = P1)
     || ' nota=' || (SELECT nota FROM public.lead_storico WHERE lead_id = L1 AND nota LIKE 'Collegamento da import Gamma%'));

  -- 4. collega_lead_da_riconciliare
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.collega_lead_da_riconciliare((SELECT id FROM public.lead_riconciliazioni WHERE lead_id = L2), C1); EXCEPTION WHEN OTHERS THEN out := out || ('T4a ' || SQLERRM); END;
  res := public.collega_lead_da_riconciliare((SELECT id FROM public.lead_riconciliazioni WHERE lead_id = L2), C2b);
  RESET ROLE;
  SELECT esito, cliente_codice, risolto_da = A AS r, nota INTO v FROM public.lead_riconciliazioni WHERE lead_id = L2;
  out := out || ('T4b ' || v.esito || ' ' || v.cliente_codice || ' risolto_admin=' || v.r || ' tipo=' || (SELECT conversione_tipo FROM public.lead WHERE id = L2) || ' nota=' || v.nota
     || ' notifiche_manuali=' || (SELECT count(*) FROM public.notifiche WHERE metadata->>'lead_id' = L2::text AND tipo = 'lead_riconciliato'));

  -- 5. permessi
  out := out || ('T5a anon: tabella=' || has_table_privilege('anon', 'public.lead_riconciliazioni', 'SELECT')
     || ' interna=' || has_function_privilege('anon', 'public._collega_lead_a_cliente_interno(uuid,uuid,uuid,text,text)', 'EXECUTE')
     || ' motore=' || has_function_privilege('anon', 'public.riconcilia_lead_clienti(uuid,uuid)', 'EXECUTE')
     || ' ora=' || has_function_privilege('anon', 'public.riconcilia_lead_ora()', 'EXECUTE')
     || ' manuale=' || has_function_privilege('anon', 'public.collega_lead_da_riconciliare(uuid,uuid)', 'EXECUTE')
     || ' collega=' || has_function_privilege('anon', 'public.collega_lead_a_cliente(uuid,uuid)', 'EXECUTE')
     || ' annulla=' || has_function_privilege('anon', 'public.annulla_conversione_lead(uuid)', 'EXECUTE'));
  out := out || ('T5b authenticated: interna=' || has_function_privilege('authenticated', 'public._collega_lead_a_cliente_interno(uuid,uuid,uuid,text,text)', 'EXECUTE')
     || ' motore=' || has_function_privilege('authenticated', 'public.riconcilia_lead_clienti(uuid,uuid)', 'EXECUTE')
     || ' ora=' || has_function_privilege('authenticated', 'public.riconcilia_lead_ora()', 'EXECUTE')
     || ' manuale=' || has_function_privilege('authenticated', 'public.collega_lead_da_riconciliare(uuid,uuid)', 'EXECUTE')
     || ' scrittura_tabella=' || has_table_privilege('authenticated', 'public.lead_riconciliazioni', 'INSERT'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', U, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.lead_riconciliazioni;
  ok := NOT EXISTS (SELECT 1 FROM public.lead_riconciliazioni WHERE lead_creato_da IS DISTINCT FROM U);
  BEGIN PERFORM public.riconcilia_lead_ora(); out := out || 'T5d FAIL'; EXCEPTION WHEN OTHERS THEN out := out || ('T5d ora_non_admin: ' || SQLERRM); END;
  BEGIN PERFORM public.collega_lead_da_riconciliare(gen_random_uuid(), C1); EXCEPTION WHEN OTHERS THEN out := out || ('T5e manuale_senza_modulo: ' || SQLERRM); END;
  RESET ROLE;
  out := out || ('T5c utente senza modulo vede=' || n || ' solo_proprie=' || ok || ' (L2 di admin esclusa)');
  out := out || ('T6 lead collegati prima=' || pre_lead);

  RAISE EXCEPTION 'ROLLBACK_FM99%', E'\n' || array_to_string(out, E'\n');
END
$t$;
