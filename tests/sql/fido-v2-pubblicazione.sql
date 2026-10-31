-- FM55 5a: verifica il contratto pubblicato senza cambiare dati.
BEGIN;
DO $test$
BEGIN
  ASSERT (SELECT count(*) FROM public.fido_teorico_cliente)=12900, '12900 righe pubblicate';
  ASSERT (SELECT sum(fido_proposto) FROM public.fido_teorico_cliente)=13100500, 'Totale baseline v2';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.fido_teorico_cliente f FULL JOIN public.fido_teorico_v2 v USING(cliente_id)
    WHERE f.cliente_id IS NULL OR v.cliente_id IS NULL OR
    ROW(f.fido_proposto,f.fido_attuale,f.scostamento,f.esposizione_corrente,
        f.coefficiente,f.richiede_verifica,f.nota_proposta,f.profilo_pagamento,
        f.ritmo_mensile,f.giorni,f.fido_base,f.fido_base_lordo,f.fido_teorico_puro,
        f.fido_proposto_senza_coefficiente,f.pavimento_applicato,f.regola_applicata,
        f.acquisto_storico,f.acquisto_tendenza,f.acquisto_mensile,f.ciclo_gg,
        f.mesi_stagionali,f.profilo,f.base,f.ordini_aperti,f.fabbisogno,f.consumo_perc,f.spiegazione)
    IS DISTINCT FROM
    ROW(v.fido_proposto,v.fido_attuale,v.fido_proposto-v.fido_attuale,v.esposizione,
        v.coefficiente,v.da_verificare,v.spiegazione,
        CASE WHEN v.profilo LIKE 'patologico%' THEN 'patologico' ELSE 'sano' END,
        v.acquisto_mensile,round(v.ciclo_gg)::integer,v.base,v.base,v.base,
        public.arrotonda_fido_v2(GREATEST(v.acquisto_mensile*v.mesi_stagionali,v.fabbisogno)),
        false,CASE WHEN v.regola IN ('fascia_500','fascia_5000') THEN 'calcolo' ELSE v.regola END,
        v.acquisto_storico,v.acquisto_tendenza,v.acquisto_mensile,v.ciclo_gg,
        v.mesi_stagionali,v.profilo,v.base,v.ordini_aperti,v.fabbisogno,v.consumo_perc,v.spiegazione)
  ), 'Tutte le colonne mappate coincidono con la v2';
END;
$test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"485baff2-b930-4947-a868-9e3da3d3a0c9","role":"authenticated","aal":"aal2"}',true);
DO $test$
BEGIN
 ASSERT (SELECT count(*) FROM public.fido_teorico_cliente)=12900, 'Visibilità invariata';
 ASSERT (SELECT md5(string_agg(cliente_id::text, ',' ORDER BY cliente_id)) FROM public.fido_teorico_cliente)='8e3fe0d636953311e12d44f8f2d4f0e0', 'Stessi id visibili';
END;
$test$;
ROLLBACK;