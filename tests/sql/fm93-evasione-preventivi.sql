-- Prova reale annullata: utente Andrea, MFA aal2. Nessun dato persistente.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}',true);
DO $test$
DECLARE
  v_prev uuid := '05cf2b75-303e-469f-bd42-a6ad0602b692';
  v_riga uuid := 'c0d3aec8-d76e-4463-aed1-b6ffb8f76c6a';
  v_ordine uuid;
  v_qta numeric;
  v_selezione jsonb := '[{"blocco_id":"fef85949-6bd7-40c4-93b8-685d975b62f9","righe":[{"riga_id":"c0d3aec8-d76e-4463-aed1-b6ffb8f76c6a","quantita":4}]}]';
  v_rifiutata boolean := false;
BEGIN
  v_ordine := public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  SELECT qta_ordinata INTO v_qta FROM public.righe_preventivo WHERE id=v_riga;
  IF v_qta IS DISTINCT FROM 4::numeric THEN RAISE EXCEPTION 'TEST: quantità dopo ordine %',v_qta; END IF;
  IF (SELECT store_id FROM public.preventivi WHERE id=v_ordine) IS DISTINCT FROM (SELECT store_id FROM public.preventivi WHERE id=v_prev) THEN RAISE EXCEPTION 'TEST: sede non ereditata'; END IF;
  DELETE FROM public.preventivi WHERE id=v_ordine;
  SELECT qta_ordinata INTO v_qta FROM public.righe_preventivo WHERE id=v_riga;
  IF v_qta IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'TEST: quantità dopo cancellazione %',v_qta; END IF;
  PERFORM public.chiudi_preventivo(v_prev);
  BEGIN
    PERFORM public.trasforma_preventivo_in_ordine(v_prev,v_selezione);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Il preventivo è chiuso: non è più trasformabile in ordine' THEN RAISE; END IF;
    v_rifiutata := true;
  END;
  IF NOT v_rifiutata THEN RAISE EXCEPTION 'TEST: preventivo chiuso trasformato'; END IF;
  PERFORM public.riapri_preventivo(v_prev);
  IF EXISTS (SELECT 1 FROM public.preventivi WHERE id=v_prev AND (chiuso_at IS NOT NULL OR chiuso_da IS NOT NULL)) THEN RAISE EXCEPTION 'TEST: riapertura incompleta'; END IF;
END;
$test$;
ROLLBACK;