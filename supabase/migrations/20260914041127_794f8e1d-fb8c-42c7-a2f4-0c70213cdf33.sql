CREATE OR REPLACE FUNCTION public.stato_privacy_contatto(_contatto_id uuid)
RETURNS TABLE(
  privacy_raccolta boolean,
  ha_trattamento_dati boolean,
  privacy_firmata boolean,
  data_ultima timestamptz,
  origine_ultima text,
  ha_pdf boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ct AS (
    SELECT c.privacy_firmata, c.pdf_privacy_path
    FROM public.contatti c WHERE c.id = _contatto_id
  ),
  log_td AS (
    SELECT cl.created_at, cl.origine
    FROM public.consensi_log cl
    WHERE cl.contatto_id = _contatto_id
      AND cl.tipo_consenso = 'trattamento_dati'
      AND cl.valore IS TRUE
    ORDER BY cl.created_at DESC, cl.id DESC
    LIMIT 1
  )
  SELECT
    (COALESCE((SELECT true FROM log_td), false) OR COALESCE((SELECT privacy_firmata FROM ct), false)) AS privacy_raccolta,
    COALESCE((SELECT true FROM log_td), false) AS ha_trattamento_dati,
    COALESCE((SELECT privacy_firmata FROM ct), false) AS privacy_firmata,
    (SELECT created_at FROM log_td) AS data_ultima,
    (SELECT origine FROM log_td) AS origine_ultima,
    COALESCE((SELECT pdf_privacy_path IS NOT NULL FROM ct), false) AS ha_pdf;
$$;

REVOKE ALL ON FUNCTION public.stato_privacy_contatto(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stato_privacy_contatto(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.stato_privacy_contatto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stato_privacy_contatto(uuid) TO service_role;