CREATE OR REPLACE FUNCTION public.get_stato_consensi(_contatto_ids uuid[])
RETURNS TABLE(contatto_id uuid, trattamento_dati boolean, whatsapp boolean, email boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input AS (
    SELECT unnest(_contatto_ids) AS id
  ),
  trattamento AS (
    SELECT DISTINCT ON (cl.contatto_id)
      cl.contatto_id,
      cl.valore AS attivo
    FROM public.consensi_log cl
    WHERE cl.contatto_id = ANY(_contatto_ids)
      AND cl.tipo_consenso = 'trattamento_dati'
    ORDER BY cl.contatto_id, cl.created_at DESC
  ),
  abilitanti_whatsapp AS (
    SELECT cl.contatto_id, max(cl.created_at) AS max_at
    FROM public.consensi_log cl
    WHERE cl.contatto_id = ANY(_contatto_ids)
      AND cl.tipo_consenso IN ('whatsapp', 'marketing_diretto')
      AND cl.valore = true
    GROUP BY cl.contatto_id
  ),
  stop_whatsapp AS (
    SELECT cl.contatto_id, max(cl.created_at) AS max_at
    FROM public.consensi_log cl
    WHERE cl.contatto_id = ANY(_contatto_ids)
      AND cl.tipo_consenso = 'whatsapp'
      AND cl.valore = false
    GROUP BY cl.contatto_id
  ),
  email_consenso AS (
    SELECT DISTINCT ON (cl.contatto_id)
      cl.contatto_id,
      cl.valore AS attivo
    FROM public.consensi_log cl
    WHERE cl.contatto_id = ANY(_contatto_ids)
      AND cl.tipo_consenso = 'marketing_diretto'
    ORDER BY cl.contatto_id, cl.created_at DESC
  ),
  opt_out_email AS (
    SELECT DISTINCT ON (lower(trim(moo.email)))
      lower(trim(moo.email)) AS email_norm
    FROM public.marketing_opt_out moo
    WHERE lower(trim(moo.email)) = ANY(
      SELECT lower(trim(c.email))
      FROM public.contatti c
      WHERE c.id = ANY(_contatto_ids)
        AND c.email IS NOT NULL
    )
    ORDER BY lower(trim(moo.email)), moo.created_at DESC
  )
  SELECT
    i.id AS contatto_id,
    COALESCE(t.attivo, false) AS trattamento_dati,
    (
      aw.max_at IS NOT NULL
      AND (sw.max_at IS NULL OR sw.max_at < aw.max_at)
    ) AS whatsapp,
    COALESCE(
      (
        SELECT false
        FROM opt_out_email oo
        WHERE oo.email_norm = lower(trim(c.email))
        LIMIT 1
      ),
      COALESCE(ec.attivo, false)
    ) AS email
  FROM input i
  LEFT JOIN public.contatti c ON c.id = i.id
  LEFT JOIN trattamento t ON t.contatto_id = i.id
  LEFT JOIN abilitanti_whatsapp aw ON aw.contatto_id = i.id
  LEFT JOIN stop_whatsapp sw ON sw.contatto_id = i.id
  LEFT JOIN email_consenso ec ON ec.contatto_id = i.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stato_consensi(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stato_consensi(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stato_consensi(uuid[]) TO supabase_read_only_user;