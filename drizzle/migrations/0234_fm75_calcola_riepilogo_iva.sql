CREATE OR REPLACE FUNCTION public.calcola_riepilogo_iva(p_preventivo_id uuid)
 RETURNS TABLE(aliquota numeric, imponibile numeric, iva numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT regime_iva, COALESCE(iva_perc, 22) AS iva_testata FROM public.preventivi WHERE id = p_preventivo_id
  ), r AS (
    SELECT ROUND(COALESCE(rp.importo, 0) * 100) AS c, rp.bene_significativo AS bs, rp.aliquota_iva
      FROM public.righe_preventivo rp JOIN public.blocchi_preventivo b ON b.id = rp.blocco_id
     WHERE b.preventivo_id = p_preventivo_id
  ), tb AS (
    SELECT COALESCE(SUM(c), 0) AS t, COALESCE(SUM(c) FILTER (WHERE bs), 0) AS b FROM r
  ), gruppi AS (
    SELECT COALESCE(r.aliquota_iva, p.iva_testata) AS aliq, SUM(r.c) AS c
      FROM r, p WHERE p.regime_iva = 'ordinaria' GROUP BY 1
    UNION ALL
    SELECT 10, tb.t FROM tb, p WHERE p.regime_iva = 'agevolata_10'
    UNION ALL
    SELECT 10, tb.t - GREATEST(0, 2 * tb.b - tb.t) FROM tb, p WHERE p.regime_iva = 'agevolata_10_bs'
    UNION ALL
    SELECT 22, GREATEST(0, 2 * tb.b - tb.t) FROM tb, p WHERE p.regime_iva = 'agevolata_10_bs'
  )
  SELECT g.aliq, ROUND(g.c / 100.0, 2), ROUND(ROUND(g.c * g.aliq / 100.0) / 100.0, 2)
    FROM gruppi g WHERE g.c <> 0 ORDER BY g.aliq;
$function$;

COMMENT ON FUNCTION public.calcola_riepilogo_iva(uuid) IS 'FM75 F3b: gemello SQL documentato di riepilogoIva (src/lib/calcolo-iva.ts, fonte unica TS). Centesimi interi, IVA per aliquota arrotondata metà lontano da zero, gruppi a zero omessi. Non collegato ai totali (iva_perc resta la fonte fino a F3c).';

REVOKE EXECUTE ON FUNCTION public.calcola_riepilogo_iva(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcola_riepilogo_iva(uuid) TO authenticated, service_role;