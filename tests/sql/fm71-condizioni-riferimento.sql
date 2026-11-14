-- FM71 fetta 1: sola lettura; claims di prova come FM65, ripristinati dal ROLLBACK.
-- Eseguire con psql -v ON_ERROR_STOP=1 su una connessione abilitata a SET ROLE.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}', true);

DO $$
DECLARE
  cl record; cliente record; riferimento record;
BEGIN
  SELECT c.id, c.store_id INTO STRICT cl FROM public.clienti c
  JOIN public.clienti_condizioni_gamma cg ON cg.cliente_id = c.id WHERE cg.cliente_codice = 13380;
  SELECT * INTO STRICT cliente FROM public.prezzi_preventivo_cliente(cl.id, ARRAY['FASL00H003300A0'], DATE '2026-11-13');
  SELECT * INTO STRICT riferimento FROM public.prezzi_preventivo_riferimento(30::smallint, '01', '01', cl.store_id, ARRAY['FASL00H003300A0'], DATE '2026-11-13');
  IF cliente.prezzo_netto IS DISTINCT FROM 3.7503 OR riferimento.prezzo_netto IS DISTINCT FROM 3.7503 THEN
    RAISE EXCEPTION 'FM71 A.N. 13380: atteso 3,7503 per cliente e riferimento, ottenuti % / %', cliente.prezzo_netto, riferimento.prezzo_netto;
  END IF;
END $$;

DO $$
DECLARE
  cl record; cliente record; riferimento record;
BEGIN
  SELECT c.id, c.store_id INTO STRICT cl FROM public.clienti c
  JOIN public.clienti_condizioni_gamma cg ON cg.cliente_id = c.id WHERE cg.cliente_codice = 13427;
  SELECT * INTO STRICT cliente FROM public.prezzi_preventivo_cliente(cl.id, ARRAY['FASL00H003300A0'], DATE '2026-11-13');
  SELECT * INTO STRICT riferimento FROM public.prezzi_preventivo_riferimento(30::smallint, '01', '01', cl.store_id, ARRAY['FASL00H003300A0'], DATE '2026-11-13');
  IF cliente.prezzo_netto IS DISTINCT FROM 3.4700 OR NOT ('cliente/articolo' = ANY(cliente.regole)) THEN
    RAISE EXCEPTION 'FM71 INTECH 13427: accordo cliente atteso 3,4700, ottenuto %', cliente.prezzo_netto;
  END IF;
  IF riferimento.prezzo_netto IS NULL OR riferimento.prezzo_netto = 3.4700
     OR EXISTS (SELECT 1 FROM unnest(riferimento.regole) r WHERE r LIKE 'famiglia %' OR r LIKE 'più articoli %' OR r = 'cliente/articolo') THEN
    RAISE EXCEPTION 'FM71 INTECH: riferimento deve ignorare accordi 50/60/90: % / %', riferimento.prezzo_netto, riferimento.regole;
  END IF;
END $$;

DO $$
DECLARE
  cl record; cliente record; riferimento record;
BEGIN
  SELECT c.id, c.store_id INTO STRICT cl FROM public.clienti c
  JOIN public.clienti_condizioni_gamma cg ON cg.cliente_id = c.id
  JOIN public.stores s ON s.id = c.store_id
  WHERE cg.cliente_codice = 5003 AND s.nome = 'SEDE DI CAMBIAGO';
  SELECT * INTO STRICT cliente FROM public.prezzi_preventivo_cliente(cl.id, ARRAY['ITA1000108'], DATE '2026-11-13');
  SELECT * INTO STRICT riferimento FROM public.prezzi_preventivo_riferimento(10::smallint, '01', '01', cl.store_id, ARRAY['ITA1000108'], DATE '2026-11-13');
  IF cliente.prezzo_netto IS DISTINCT FROM 4.8000 OR riferimento.prezzo_netto IS DISTINCT FROM 4.8000
     OR riferimento.fonte_prezzo IS DISTINCT FROM 'deposito' OR riferimento.deposito_codice IS DISTINCT FROM 'CA'
     OR NOT ('deposito CA' = ANY(riferimento.regole)) THEN
    RAISE EXCEPTION 'FM71 DELEO: atteso deposito CA 4,8000, ottenuti % / %, %', cliente.prezzo_netto, riferimento.prezzo_netto, riferimento.regole;
  END IF;
END $$;

-- Limite identico al motore cliente; 500 accettati, 501 rifiutati.
DO $$
BEGIN
  PERFORM * FROM public.prezzi_preventivo_riferimento(30::smallint, '01', '01', NULL, array_fill('FASL00H003300A0'::text, ARRAY[500]));
  BEGIN
    PERFORM * FROM public.prezzi_preventivo_riferimento(30::smallint, '01', '01', NULL, array_fill('FASL00H003300A0'::text, ARRAY[501]));
    RAISE EXCEPTION 'FM71: 501 codici non rifiutati';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.prezzi_preventivo_riferimento(30::smallint, '01', '01', NULL, ARRAY['FASL00H003300A0']);
    RAISE EXCEPTION 'FM71: accesso senza utente non rifiutato';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
ROLLBACK;