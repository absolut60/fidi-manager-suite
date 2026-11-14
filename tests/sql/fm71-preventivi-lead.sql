-- FM71 3a: eseguire con connessione abilitata a SET ROLE. Solo fixture nuove,
-- nessuna modifica di righe reali; il ROLLBACK annulla fixture e claims.
BEGIN;
DO $test$
DECLARE
  cliente uuid; altro_cliente uuid; proprio uuid; altro uuid; da_convertire uuid;
  preventivo uuid; p_proprio uuid; p_altro uuid; prima jsonb; dopo jsonb;
  vincolo text;
BEGIN
  INSERT INTO public.clienti(ragione_sociale) VALUES ('FM71 TEST cliente') RETURNING id INTO cliente;
  INSERT INTO public.clienti(ragione_sociale) VALUES ('FM71 TEST altro cliente') RETURNING id INTO altro_cliente;
  INSERT INTO public.lead(ragione_sociale, agente_codice, created_by)
    VALUES ('FM71 TEST lead agente 7', '7', NULL) RETURNING id INTO proprio;
  INSERT INTO public.lead(ragione_sociale, agente_codice, created_by)
    VALUES ('FM71 TEST lead agente 8', '8', NULL) RETURNING id INTO altro;
  INSERT INTO public.lead(ragione_sociale, created_by)
    VALUES ('FM71 TEST conversione', NULL) RETURNING id INTO da_convertire;

  -- a: lead senza cliente ammesso; entrambi vietati dal CHECK specifico.
  INSERT INTO public.preventivi(lead_id, cliente_id, listino_rif, macrocategoria_rif, categoria_rif, note)
    VALUES (da_convertire, NULL, 30, '01', '01', 'FM71 prezzi e condizioni invariati') RETURNING id INTO preventivo;
  BEGIN
    INSERT INTO public.preventivi(lead_id, cliente_id) VALUES (da_convertire, cliente);
    RAISE EXCEPTION 'FM71: cliente e lead insieme non rifiutati';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS vincolo = CONSTRAINT_NAME;
    IF vincolo <> 'preventivi_cliente_lead_alternativi' THEN
      RAISE EXCEPTION 'FM71: violazione del vincolo sbagliato: %', vincolo;
    END IF;
  END;

  -- b: riaggancio esatto, nessun altro valore del preventivo cambiato.
  SELECT to_jsonb(p) - ARRAY['cliente_id','lead_id','lead_origine_id','updated_at'] INTO prima
    FROM public.preventivi p WHERE p.id=preventivo;
  UPDATE public.lead SET cliente_id=cliente WHERE id=da_convertire;
  IF NOT EXISTS (SELECT 1 FROM public.preventivi WHERE id=preventivo
    AND cliente_id=cliente AND lead_id IS NULL AND lead_origine_id=da_convertire) THEN
    RAISE EXCEPTION 'FM71: riaggancio o provenienza errati';
  END IF;
  SELECT to_jsonb(p) - ARRAY['cliente_id','lead_id','lead_origine_id','updated_at'] INTO dopo
    FROM public.preventivi p WHERE p.id=preventivo;
  IF prima IS DISTINCT FROM dopo THEN RAISE EXCEPTION 'FM71: altri campi modificati dal riaggancio'; END IF;
  UPDATE public.lead SET cliente_id=altro_cliente WHERE id=da_convertire;
  IF NOT EXISTS (SELECT 1 FROM public.preventivi WHERE id=preventivo AND cliente_id=cliente) THEN
    RAISE EXCEPTION 'FM71: il riaggancio deve avvenire solo da NULL a cliente';
  END IF;

  -- c: agente della fixture reale indicata, aal2; nessun agente sul preventivo,
  -- nessun autore sul lead: la visibilità dipende solo dal lead collegato.
  INSERT INTO public.preventivi(lead_id, agente_codice, creato_da)
    VALUES (proprio, NULL, NULL) RETURNING id INTO p_proprio;
  INSERT INTO public.preventivi(lead_id, agente_codice, creato_da)
    VALUES (altro, NULL, NULL) RETURNING id INTO p_altro;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"3acf945a-7456-43b4-850c-c4ab5365eb84","role":"authenticated","aal":"aal2"}', true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.preventivi WHERE id=p_proprio) THEN
    RAISE EXCEPTION 'FM71: preventivo del lead proprio non visibile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.preventivi WHERE id=p_altro) THEN
    RAISE EXCEPTION 'FM71: preventivo del lead altrui visibile';
  END IF;
  IF NOT public.auth_vede_preventivo_id(p_proprio) OR public.auth_vede_preventivo_id(p_altro) THEN
    RAISE EXCEPTION 'FM71: gate per ID non allineato alla policy';
  END IF;
  RESET ROLE;
END;
$test$;
SELECT 'FM71 3a: CHECK, riaggancio, campi invariati, transizione e RLS agente superati' AS esito;
ROLLBACK;