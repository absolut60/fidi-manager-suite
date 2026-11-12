-- Prova sui dati reali: nessun import, ogni modifica viene annullata.
BEGIN;
DO $$
DECLARE
  v_codici text[];
  v_attivi bigint;
  v_listini bigint;
  v_md5_articoli text;
  v_md5_listini text;
  v_messaggio text;
  v_atteso text;
BEGIN
  SELECT count(*), md5(string_agg(row_to_json(a)::text, ',' ORDER BY codice))
  INTO v_attivi, v_md5_articoli FROM public.articoli_gamma a WHERE attivo;
  SELECT count(*), md5(string_agg(row_to_json(l)::text, ',' ORDER BY articolo_codice, listino))
  INTO v_listini, v_md5_listini FROM public.articoli_gamma_listini l;
  SELECT array_agg(codice ORDER BY codice) INTO v_codici
  FROM (SELECT codice FROM public.articoli_gamma WHERE attivo ORDER BY codice LIMIT 10) s;
  IF cardinality(v_codici) <> 10 OR v_attivi <> 64556 THEN
    RAISE EXCEPTION 'Precondizione test non rispettata: attesi 10 codici e 64556 attivi';
  END IF;
  v_atteso := format('Disattivazione bloccata: %s articoli assenti su %s attivi, oltre il 5%%: controllare il file', v_attivi - 10, v_attivi);
  BEGIN
    PERFORM public.disattiva_articoli_gamma_assenti(v_codici);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_messaggio = MESSAGE_TEXT;
  END;
  IF v_messaggio IS DISTINCT FROM v_atteso THEN
    RAISE EXCEPTION 'Freno non rispettato: atteso %, ottenuto %', v_atteso, v_messaggio;
  END IF;
  IF (SELECT count(*) FROM public.articoli_gamma WHERE attivo) <> v_attivi
    OR (SELECT md5(string_agg(row_to_json(a)::text, ',' ORDER BY codice)) FROM public.articoli_gamma a WHERE attivo) IS DISTINCT FROM v_md5_articoli
    OR (SELECT count(*) FROM public.articoli_gamma_listini) <> v_listini
    OR (SELECT md5(string_agg(row_to_json(l)::text, ',' ORDER BY articolo_codice, listino)) FROM public.articoli_gamma_listini l) IS DISTINCT FROM v_md5_listini THEN
    RAISE EXCEPTION 'Dati cambiati durante la prova del freno';
  END IF;
  RAISE NOTICE '%', v_messaggio;
  RAISE NOTICE 'PASS: count e impronte complete di articoli attivi e listini invariati';
END;
$$;
ROLLBACK;