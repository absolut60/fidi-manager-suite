-- Five explicitly requested users; every write is rolled back.
BEGIN;
CREATE TEMP TABLE fm69_prova(nome text, condizioni jsonb, errore text, aggiornabile boolean, modificabile boolean);
DO $$ DECLARE u record; ris jsonb; err text; ids uuid[]; perm boolean; BEGIN
FOR u IN SELECT * FROM (VALUES ('Andrea','485baff2-b930-4947-a868-9e3da3d3a0c9'),('Pierpaolo','fb7214e8-6774-44f7-98ba-d744255cb027'),('Luciano','18f27dbc-753d-46b9-8644-bb3724ce8dd0'),('Marco','3acf945a-7456-43b4-850c-c4ab5365eb84'),('Daniele','3e29cea4-1756-4c88-b198-14d07bebfe02')) AS t(nome,id) LOOP
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
ris:=NULL; err:=NULL;
BEGIN SELECT jsonb_agg(to_jsonb(c)) INTO ris FROM public.condizioni_preventivo_cliente('fb0f205c-ffae-4463-9601-9a4b3b7e63e8') c; EXCEPTION WHEN OTHERS THEN err:=SQLSTATE||': '||SQLERRM; END;
SELECT EXISTS(SELECT 1 FROM public.cantieri_modificabili(ARRAY['d1011fee-4a2b-43f8-921d-2c5a8528603c'::uuid])) INTO perm;
WITH aggiornati AS (UPDATE public.cantieri SET nome=nome WHERE id='d1011fee-4a2b-43f8-921d-2c5a8528603c' RETURNING id) SELECT array_agg(id) INTO ids FROM aggiornati;
RESET ROLE;
IF perm IS DISTINCT FROM (coalesce(cardinality(ids),0)>0) THEN RAISE EXCEPTION 'RPC/UPDATE diversi per %',u.nome; END IF;
IF err IS NOT NULL OR ris IS NULL THEN RAISE EXCEPTION 'Condizioni non disponibili per %: %',u.nome,err; END IF;
INSERT INTO fm69_prova VALUES(u.nome,ris,err,coalesce(cardinality(ids),0)>0,perm);
END LOOP; END $$;
SELECT * FROM fm69_prova;
ROLLBACK;