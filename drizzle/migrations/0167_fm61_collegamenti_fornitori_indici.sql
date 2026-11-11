CREATE INDEX IF NOT EXISTS clienti_piva_norm_idx ON public.clienti (upper(btrim(partita_iva)));
CREATE INDEX IF NOT EXISTS clienti_cf_norm_idx ON public.clienti (upper(btrim(codice_fiscale)));
CREATE INDEX IF NOT EXISTS fornitori_gamma_piva_norm_idx ON public.fornitori (upper(btrim(partita_iva))) WHERE origine = 'gamma';
CREATE INDEX IF NOT EXISTS fornitori_gamma_cf_norm_idx ON public.fornitori (upper(btrim(codice_fiscale))) WHERE origine = 'gamma';

-- Stesso risultato della versione 0159: due join separati (P.IVA, CF) al posto del join con OR.
CREATE OR REPLACE FUNCTION public.ricalcola_collegamenti_fornitori_clienti()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gamma integer;
  v_piva integer;
BEGIN
  DELETE FROM public.fornitore_cliente WHERE origine IN ('gamma','piva_cf');

  INSERT INTO public.fornitore_cliente (fornitore_id, cliente_id, origine)
  SELECT f.id, c.id, 'gamma'
  FROM public.fornitori f
  JOIN public.clienti c ON trim(c.codice_gestionale) = f.codice_cliente_gamma::text
  WHERE f.origine = 'gamma' AND f.codice_cliente_gamma IS NOT NULL
  ON CONFLICT (fornitore_id, cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_gamma = ROW_COUNT;

  WITH f AS MATERIALIZED (
    SELECT id,
      NULLIF(upper(btrim(partita_iva)), '') AS piva,
      NULLIF(upper(btrim(codice_fiscale)), '') AS cf
    FROM public.fornitori WHERE origine = 'gamma'
  ), su AS (
    SELECT f.id AS fid, c.id AS cid, 'p'::text AS t
    FROM f JOIN public.clienti c ON upper(btrim(c.partita_iva)) = f.piva
    WHERE f.piva IS NOT NULL AND f.piva !~ '^0+$'
    UNION ALL
    SELECT f.id, c.id, 'c'
    FROM f JOIN public.clienti c ON upper(btrim(c.codice_fiscale)) = f.cf
    WHERE f.cf IS NOT NULL AND f.cf !~ '^0+$'
  ), coppie AS (
    SELECT fid, cid, bool_or(t = 'p') AS su_piva, bool_or(t = 'c') AS su_cf
    FROM su GROUP BY fid, cid
  )
  INSERT INTO public.fornitore_cliente (fornitore_id, cliente_id, origine, coincide_su)
  SELECT fid, cid, 'piva_cf',
    CASE WHEN su_piva AND su_cf THEN 'piva+cf' WHEN su_piva THEN 'piva' ELSE 'cf' END
  FROM coppie
  ON CONFLICT (fornitore_id, cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_piva = ROW_COUNT;

  RETURN jsonb_build_object('collegamenti_gamma', v_gamma, 'collegamenti_piva_cf', v_piva);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ricalcola_collegamenti_fornitori_clienti() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ricalcola_collegamenti_fornitori_clienti() TO service_role;