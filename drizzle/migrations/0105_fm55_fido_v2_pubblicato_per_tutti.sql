ALTER TABLE public.fido_teorico_cliente
 ADD COLUMN acquisto_storico numeric,
 ADD COLUMN acquisto_tendenza numeric,
 ADD COLUMN acquisto_mensile numeric,
 ADD COLUMN ciclo_gg numeric,
 ADD COLUMN mesi_stagionali numeric,
 ADD COLUMN profilo text,
 ADD COLUMN base numeric,
 ADD COLUMN ordini_aperti numeric,
 ADD COLUMN fabbisogno numeric,
 ADD COLUMN consumo_perc numeric,
 ADD COLUMN spiegazione text;

CREATE OR REPLACE FUNCTION public.ricalcola_fido_teorico_blocco(_dopo_id uuid, _dimensione integer DEFAULT 500)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ids uuid[];
BEGIN
 IF current_setting('role', true) <> 'service_role'
 AND session_user NOT IN ('postgres', 'supabase_admin')
 AND NOT public.has_role(auth.uid(), 'amministratore')
 AND NOT public.has_role(auth.uid(), 'direzione') THEN
 RAISE EXCEPTION 'Operazione non consentita';
 END IF;
 SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
 SELECT id FROM public.clienti WHERE (_dopo_id IS NULL OR id > _dopo_id) ORDER BY id LIMIT _dimensione
 ) s;
 IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN RETURN NULL; END IF;
 INSERT INTO public.fido_teorico_cliente (
 cliente_id, fatturato_rolling, ritmo_mensile, giorni, giorni_mancanti,
 fido_base, fido_base_lordo, ddt_da_fatturare, giorni_oltre_accordo,
 profilo_pagamento, coefficiente, fido_proposto, fido_proposto_senza_coefficiente,
 fido_attuale, scostamento, regola_applicata, sede_cinisello, richiede_verifica,
 nota_proposta, fido_teorico_puro, pavimento_applicato, esposizione_corrente, calcolato_at
 ) SELECT
 t.cliente_id, t.fatturato_rolling, t.ritmo_mensile, t.giorni, t.giorni_mancanti,
 t.fido_base, t.fido_base_lordo, t.ddt_da_fatturare, t.giorni_oltre_accordo,
 t.profilo_pagamento, t.coefficiente, t.fido_proposto, t.fido_proposto_senza_coefficiente,
 t.fido_attuale, t.scostamento, t.regola_applicata, t.sede_cinisello, t.richiede_verifica,
 t.nota_proposta, t.fido_teorico_puro, t.pavimento_applicato, t.esposizione_corrente, now()
 FROM public.get_fido_teorico(v_ids, false) t
 ON CONFLICT (cliente_id) DO UPDATE SET
 fatturato_rolling=EXCLUDED.fatturato_rolling, ritmo_mensile=EXCLUDED.ritmo_mensile,
 giorni=EXCLUDED.giorni, giorni_mancanti=EXCLUDED.giorni_mancanti,
 fido_base=EXCLUDED.fido_base, fido_base_lordo=EXCLUDED.fido_base_lordo,
 ddt_da_fatturare=EXCLUDED.ddt_da_fatturare, giorni_oltre_accordo=EXCLUDED.giorni_oltre_accordo,
 profilo_pagamento=EXCLUDED.profilo_pagamento, coefficiente=EXCLUDED.coefficiente,
 fido_proposto=EXCLUDED.fido_proposto, fido_proposto_senza_coefficiente=EXCLUDED.fido_proposto_senza_coefficiente,
 fido_attuale=EXCLUDED.fido_attuale, scostamento=EXCLUDED.scostamento,
 regola_applicata=EXCLUDED.regola_applicata, sede_cinisello=EXCLUDED.sede_cinisello,
 richiede_verifica=EXCLUDED.richiede_verifica, nota_proposta=EXCLUDED.nota_proposta,
 fido_teorico_puro=EXCLUDED.fido_teorico_puro, pavimento_applicato=EXCLUDED.pavimento_applicato,
 esposizione_corrente=EXCLUDED.esposizione_corrente, calcolato_at=now();
 UPDATE public.fido_teorico_cliente f SET semaforo_stadio=s.stadio,semaforo_motivo=s.motivo,semaforo_numero=s.numero
 FROM public.calcola_semaforo_affidabilita_batch(v_ids) s WHERE f.cliente_id=s.cliente_id;
 INSERT INTO public.fido_teorico_v2 (
 cliente_id,acquisto_storico,acquisto_tendenza,acquisto_mensile,ciclo_gg,
 mesi_stagionali,profilo,coefficiente,base,esposizione,ordini_aperti,fabbisogno,
 fido_proposto,fido_attuale,consumo_perc,regola,da_verificare,spiegazione,calcolato_at
 ) SELECT v.cliente_id,v.acquisto_storico,v.acquisto_tendenza,v.acquisto_mensile,v.ciclo_gg,
 v.mesi_stagionali,v.profilo,v.coefficiente,v.base,v.esposizione,v.ordini_aperti,v.fabbisogno,
 v.fido_proposto,v.fido_attuale,v.consumo_perc,v.regola,v.da_verificare,v.spiegazione,now()
 FROM public.get_fido_teorico_v2(v_ids) v
 ON CONFLICT (cliente_id) DO UPDATE SET
 acquisto_storico=EXCLUDED.acquisto_storico,acquisto_tendenza=EXCLUDED.acquisto_tendenza,
 acquisto_mensile=EXCLUDED.acquisto_mensile,ciclo_gg=EXCLUDED.ciclo_gg,
 mesi_stagionali=EXCLUDED.mesi_stagionali,profilo=EXCLUDED.profilo,coefficiente=EXCLUDED.coefficiente,
 base=EXCLUDED.base,esposizione=EXCLUDED.esposizione,ordini_aperti=EXCLUDED.ordini_aperti,
 fabbisogno=EXCLUDED.fabbisogno,fido_proposto=EXCLUDED.fido_proposto,fido_attuale=EXCLUDED.fido_attuale,
 consumo_perc=EXCLUDED.consumo_perc,regola=EXCLUDED.regola,da_verificare=EXCLUDED.da_verificare,
 spiegazione=EXCLUDED.spiegazione,calcolato_at=now();
 -- FM55: dopo gli upsert v1 e v2, i valori pubblicati per tutti sono quelli della v2.
 -- Le colonne non mappate (inclusi semaforo e dati storici v1) restano invariate.
 UPDATE public.fido_teorico_cliente f SET
 fido_proposto=v.fido_proposto,fido_attuale=v.fido_attuale,
 scostamento=v.fido_proposto-v.fido_attuale,esposizione_corrente=v.esposizione,
 coefficiente=v.coefficiente,richiede_verifica=v.da_verificare,nota_proposta=v.spiegazione,
 profilo_pagamento=CASE WHEN v.profilo LIKE 'patologico%' THEN 'patologico' ELSE 'sano' END,
 ritmo_mensile=v.acquisto_mensile,giorni=round(v.ciclo_gg)::integer,
 fido_base=v.base,fido_base_lordo=v.base,fido_teorico_puro=v.base,
 fido_proposto_senza_coefficiente=public.arrotonda_fido_v2(GREATEST(v.acquisto_mensile*v.mesi_stagionali,v.fabbisogno)),
 pavimento_applicato=false,
 regola_applicata=CASE WHEN v.regola IN ('fascia_500','fascia_5000') THEN 'calcolo' ELSE v.regola END,
 acquisto_storico=v.acquisto_storico,acquisto_tendenza=v.acquisto_tendenza,
 acquisto_mensile=v.acquisto_mensile,ciclo_gg=v.ciclo_gg,mesi_stagionali=v.mesi_stagionali,
 profilo=v.profilo,base=v.base,ordini_aperti=v.ordini_aperti,fabbisogno=v.fabbisogno,
 consumo_perc=v.consumo_perc,spiegazione=v.spiegazione
 FROM public.fido_teorico_v2 v WHERE f.cliente_id=v.cliente_id AND f.cliente_id=ANY(v_ids);
 RETURN v_ids[array_length(v_ids,1)];
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ricalcola_fido_teorico_blocco(uuid,integer) TO authenticated,service_role;
COMMENT ON COLUMN public.fido_teorico_cliente.pavimento_applicato IS 'DEPRECATED: FM55 publishes v2 values without the v1 exposure floor; retained until cleanup.';