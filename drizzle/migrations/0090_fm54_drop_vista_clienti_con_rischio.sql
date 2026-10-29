DO $$
DECLARE n integer;
BEGIN
  IF to_regclass('public.clienti_con_rischio') IS NOT NULL THEN
    SELECT count(*) INTO n
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    WHERE d.classid = 'pg_rewrite'::regclass
      AND d.refobjid = 'public.clienti_con_rischio'::regclass
      AND r.ev_class <> 'public.clienti_con_rischio'::regclass;
    IF n > 0 THEN
      RAISE EXCEPTION 'clienti_con_rischio ha % oggetti dipendenti: DROP annullato', n;
    END IF;
  END IF;
END $$;

DROP VIEW IF EXISTS public.clienti_con_rischio;