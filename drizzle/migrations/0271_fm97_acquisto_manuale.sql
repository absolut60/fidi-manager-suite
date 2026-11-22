ALTER TABLE public.righe_preventivo ADD COLUMN acq_sc1 numeric, ADD COLUMN acq_sc2 numeric, ADD COLUMN acq_sc3 numeric, ADD COLUMN acq_magg_perc numeric, ADD COLUMN acq_magg_euro numeric;
COMMENT ON COLUMN public.righe_preventivo.acq_sc1 IS 'FM97: primo sconto acquisto in percentuale, convenzione Gamma; NULL senza valore.';
COMMENT ON COLUMN public.righe_preventivo.acq_sc2 IS 'FM97: secondo sconto acquisto in percentuale, in cascata; NULL senza valore.';
COMMENT ON COLUMN public.righe_preventivo.acq_sc3 IS 'FM97: terzo sconto acquisto in percentuale, in cascata; NULL senza valore.';
COMMENT ON COLUMN public.righe_preventivo.acq_magg_perc IS 'FM97: maggiorazione acquisto percentuale dopo gli sconti; NULL senza valore.';
COMMENT ON COLUMN public.righe_preventivo.acq_magg_euro IS 'FM97: maggiorazione acquisto in euro per unita UM1, dopo la maggiorazione percentuale; NULL senza valore.';
DO $fm97$
DECLARE prima text; dopo text;
BEGIN
  SELECT pg_get_functiondef('public.trasforma_preventivo_in_ordine(uuid,jsonb)'::regprocedure) INTO prima;
  IF md5(prima) <> '561ad7e3d27bb97b3113821e6d36b738' THEN RAISE EXCEPTION 'FM97: definizione trasformazione diversa dalla versione verificata'; END IF;
  dopo := replace(prima, 'um2, fattore_conversione' || chr(10) || '      ) VALUES (', 'um2, fattore_conversione, acq_sc1, acq_sc2, acq_sc3, acq_magg_perc, acq_magg_euro' || chr(10) || '      ) VALUES (');
  dopo := replace(dopo, 'v_src_riga.um2, v_src_riga.fattore_conversione' || chr(10) || '      );', 'v_src_riga.um2, v_src_riga.fattore_conversione, v_src_riga.acq_sc1, v_src_riga.acq_sc2, v_src_riga.acq_sc3, v_src_riga.acq_magg_perc, v_src_riga.acq_magg_euro' || chr(10) || '      );');
  IF dopo = prima OR position('fattore_conversione, acq_sc1, acq_sc2, acq_sc3, acq_magg_perc, acq_magg_euro' IN dopo) = 0 OR position('v_src_riga.fattore_conversione, v_src_riga.acq_sc1, v_src_riga.acq_sc2, v_src_riga.acq_sc3, v_src_riga.acq_magg_perc, v_src_riga.acq_magg_euro' IN dopo) = 0 THEN RAISE EXCEPTION 'FM97: sostituzione colonne acquisto incompleta'; END IF;
  EXECUTE dopo;
END;
$fm97$;
REVOKE EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trasforma_preventivo_in_ordine(uuid,jsonb) TO authenticated, service_role;