-- Transactional regression test: no persisted fixtures, no auth data changes.
BEGIN;
INSERT INTO public.cantieri(id,nome,cliente_id,lead_id,agente_codice,created_by) VALUES
('f6900000-0000-4000-8000-000000000001','FM69 TEST Cinisello','00979199-c388-4839-9fdf-3a05da587c21',NULL,'8','fb7214e8-6774-44f7-98ba-d744255cb027'),
('f6900000-0000-4000-8000-000000000002','FM69 TEST agente 7','181799a0-d3c3-4f37-b345-8370299d2085',NULL,'7','18f27dbc-753d-46b9-8644-bb3724ce8dd0'),
('f6900000-0000-4000-8000-000000000003','FM69 TEST lead',NULL,'01443521-ac30-42b5-9800-bcdbb73be2a0',NULL,'fb7214e8-6774-44f7-98ba-d744255cb027'),
('f6900000-0000-4000-8000-000000000004','FM69 TEST altri','00979199-c388-4839-9fdf-3a05da587c21',NULL,'8','485baff2-b930-4947-a868-9e3da3d3a0c9');
INSERT INTO public.cantiere_listini_speciali(cantiere_id,cod_gamma,prezzo_vendita_speciale)
SELECT id,'FM69-READ',100 FROM public.cantieri WHERE id::text LIKE 'f6900000-%';
DO $$ DECLARE u record; c record; n int; inserted boolean; nuovo uuid; autore uuid;
BEGIN
FOR u IN SELECT * FROM (VALUES
('485baff2-b930-4947-a868-9e3da3d3a0c9',ARRAY[true,true,true,true],ARRAY[true,true,true,true]),
('fb7214e8-6774-44f7-98ba-d744255cb027',ARRAY[true,false,true,true],ARRAY[true,true,true,true]),
('18f27dbc-753d-46b9-8644-bb3724ce8dd0',ARRAY[true,true,false,true],ARRAY[true,true,true,true]),
('3acf945a-7456-43b4-850c-c4ab5365eb84',ARRAY[false,true,false,false],ARRAY[false,true,false,false]),
('3e29cea4-1756-4c88-b198-14d07bebfe02',ARRAY[false,false,false,false],ARRAY[false,false,false,false]),
('3ba24530-fcf5-472a-ace8-3659caa4a729',ARRAY[false,false,false,false],ARRAY[false,false,false,false]),
('6df73575-951f-4165-bd6b-cbb4a1b01f32',ARRAY[true,true,true,true],ARRAY[true,true,true,true])
) AS utenti(id,scrive,legge) LOOP
PERFORM set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated','aal','aal2')::text,true);
EXECUTE 'SET LOCAL ROLE authenticated';
FOR c IN SELECT * FROM (VALUES
(1,'f6900000-0000-4000-8000-000000000001'),(2,'f6900000-0000-4000-8000-000000000002'),
(3,'f6900000-0000-4000-8000-000000000003'),(4,'f6900000-0000-4000-8000-000000000004')) AS casi(pos,id) LOOP
WITH righe AS (UPDATE public.cantieri SET nome=nome WHERE id=c.id::uuid RETURNING id)
SELECT count(*) INTO n FROM righe;
IF (n=1) IS DISTINCT FROM u.scrive[c.pos] THEN RAISE EXCEPTION 'UPDATE regression %, %',u.id,c.pos; END IF;
SELECT count(*) INTO n FROM public.cantiere_listini_speciali WHERE cantiere_id=c.id::uuid AND cod_gamma='FM69-READ';
IF (n=1) IS DISTINCT FROM u.legge[c.pos] THEN RAISE EXCEPTION 'SELECT regression %, %',u.id,c.pos; END IF;
BEGIN
INSERT INTO public.cantiere_listini_speciali(cantiere_id,cod_gamma,prezzo_vendita_speciale,sconti)
VALUES(c.id::uuid,u.id,100,ARRAY[17,5,1,2,3,4]::numeric[]) RETURNING id,created_by INTO nuovo,autore;
IF autore IS DISTINCT FROM u.id::uuid THEN RAISE EXCEPTION 'Wrong created_by'; END IF;
UPDATE public.cantiere_listini_speciali SET maggiorazione_perc=2 WHERE id=nuovo RETURNING updated_by INTO autore;
IF autore IS DISTINCT FROM u.id::uuid THEN RAISE EXCEPTION 'Wrong updated_by'; END IF;
inserted=true;
EXCEPTION WHEN insufficient_privilege THEN inserted=false;
END;
IF inserted IS DISTINCT FROM u.scrive[c.pos] THEN RAISE EXCEPTION 'INSERT regression %, %',u.id,c.pos; END IF;
END LOOP;
EXECUTE 'RESET ROLE';
END LOOP;
END $$;
-- One assertion per value rule: defaults, maximum six discounts, uniqueness.
DO $$ DECLARE s numeric[]; m numeric; BEGIN
INSERT INTO public.cantiere_listini_speciali(cantiere_id,cod_gamma) VALUES('f6900000-0000-4000-8000-000000000001','DEFAULTS') RETURNING sconti,maggiorazione_perc INTO s,m;
IF s IS DISTINCT FROM '{}'::numeric[] OR m IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Wrong defaults'; END IF;
END $$;
DO $$ BEGIN
BEGIN
INSERT INTO public.cantiere_listini_speciali(cantiere_id,cod_gamma,sconti) VALUES('f6900000-0000-4000-8000-000000000001','SEVEN',ARRAY[1,2,3,4,5,6,7]::numeric[]);
RAISE EXCEPTION 'Seven discounts accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
END $$;
DO $$ BEGIN
BEGIN
INSERT INTO public.cantiere_listini_speciali(cantiere_id,cod_gamma) VALUES('f6900000-0000-4000-8000-000000000001','DEFAULTS');
RAISE EXCEPTION 'Duplicate accepted';
EXCEPTION WHEN unique_violation THEN NULL;
END;
END $$;
SELECT 'FM69: 28 UPDATE, 28 SELECT, 28 INSERT, audit, six discounts, defaults, uniqueness OK' AS risultato;
ROLLBACK;