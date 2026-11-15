-- FM75 F3a: regime IVA in testata e flag BS/aliquota sulle righe propagati all'ordine.
-- Eseguire come DO-block: l'eccezione finale annulla tutto (rollback).
DO $$
DECLARE v_prev uuid; v_b uuid; v_r1 uuid; v_r2 uuid; v_ord uuid; v_reg text; v_bs boolean; v_al numeric; v_bs2 boolean; v_al2 numeric;
BEGIN
  SELECT id INTO v_prev FROM public.preventivi WHERE tipo='preventivo' LIMIT 1;
  UPDATE public.preventivi SET regime_iva='agevolata_10_bs' WHERE id=v_prev;
  INSERT INTO public.blocchi_preventivo (preventivo_id, descrizione, ordine) VALUES (v_prev,'prova F3a',999) RETURNING id INTO v_b;
  INSERT INTO public.righe_preventivo (blocco_id, tipo_riga, descrizione, quantita, prezzo_unit, importo, ordine, bene_significativo, aliquota_iva)
    VALUES (v_b,'manuale','BS',1,100,100,0,true,22) RETURNING id INTO v_r1;
  INSERT INTO public.righe_preventivo (blocco_id, tipo_riga, descrizione, quantita, prezzo_unit, importo, ordine)
    VALUES (v_b,'manuale','normale',1,50,50,1) RETURNING id INTO v_r2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',(SELECT user_id FROM public.user_roles WHERE role='amministratore' LIMIT 1),'role','authenticated')::text, true);
  v_ord := public.trasforma_preventivo_in_ordine(v_prev, jsonb_build_array(jsonb_build_object('blocco_id',v_b,'righe',
    jsonb_build_array(jsonb_build_object('riga_id',v_r1,'quantita',1),jsonb_build_object('riga_id',v_r2,'quantita',1)))));
  SELECT regime_iva::text INTO v_reg FROM public.preventivi WHERE id=v_ord;
  SELECT bene_significativo, aliquota_iva INTO v_bs, v_al FROM public.righe_preventivo WHERE riga_origine_id=v_r1;
  SELECT bene_significativo, aliquota_iva INTO v_bs2, v_al2 FROM public.righe_preventivo WHERE riga_origine_id=v_r2;
  RAISE EXCEPTION 'ESITO regime=% bs=% aliquota=% | normale bs=% aliquota=%', v_reg, v_bs, v_al, v_bs2, v_al2;
END $$;
