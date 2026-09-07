CREATE OR REPLACE FUNCTION public.is_clic_automatico(_sec_dopo_invio numeric, _url_distinti_nel_burst int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Regola 1: un clic entro 60s dall'invio è del filtro di sicurezza del destinatario.
  -- Regola 2: due o più URL DIVERSI aperti entro la stessa finestra di 2 secondi non sono
  -- umanamente possibili — criterio indipendente dal numero di link presenti nella mail.
  -- Il dato grezzo resta integro: questa funzione classifica in lettura.
  SELECT (_sec_dopo_invio IS NOT NULL AND _sec_dopo_invio <= 60)
      OR (_url_distinti_nel_burst >= 2)
$$;

GRANT EXECUTE ON FUNCTION public.is_clic_automatico(numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clic_automatico(numeric, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_clic_automatico(numeric, int) TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_clic_reali_campagne()
RETURNS TABLE(campagna_id uuid, clic_reali_totali bigint, clic_reali_unici bigint, clic_auto_totali bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT cl.id, cl.destinatario_id, cl.campagna_id, cl.url_destinazione,
           EXTRACT(EPOCH FROM (cl.created_at - d.inviato_at)) AS sec,
           floor(EXTRACT(EPOCH FROM cl.created_at)/2)::bigint AS finestra
    FROM campagne_email_clic cl
    JOIN campagne_email_destinatari d ON d.id = cl.destinatario_id
    WHERE d.inviato_at IS NOT NULL
  ),
  g AS (
    SELECT destinatario_id, finestra, count(DISTINCT url_destinazione) AS n_url
    FROM base GROUP BY 1,2
  ),
  cls AS (
    SELECT b.*, public.is_clic_automatico(b.sec, g.n_url::int) AS automatico
    FROM base b
    JOIN g ON g.destinatario_id = b.destinatario_id AND g.finestra = b.finestra
  )
  SELECT campagna_id,
         count(*) FILTER (WHERE NOT automatico) AS clic_reali_totali,
         count(DISTINCT destinatario_id) FILTER (WHERE NOT automatico) AS clic_reali_unici,
         count(*) FILTER (WHERE automatico) AS clic_auto_totali
  FROM cls
  GROUP BY campagna_id
$$;

GRANT EXECUTE ON FUNCTION public.get_clic_reali_campagne() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clic_reali_campagne() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clic_reali_campagne() TO supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_clic_destinatari(_campagna_id uuid)
RETURNS TABLE(destinatario_id uuid, clic_reali int, clic_auto int, ultimo_clic_reale timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT cl.id, cl.destinatario_id, cl.created_at, cl.url_destinazione,
           EXTRACT(EPOCH FROM (cl.created_at - d.inviato_at)) AS sec,
           floor(EXTRACT(EPOCH FROM cl.created_at)/2)::bigint AS finestra
    FROM campagne_email_clic cl
    JOIN campagne_email_destinatari d ON d.id = cl.destinatario_id
    WHERE d.inviato_at IS NOT NULL
      AND cl.campagna_id = _campagna_id
  ),
  g AS (
    SELECT destinatario_id, finestra, count(DISTINCT url_destinazione) AS n_url
    FROM base GROUP BY 1,2
  ),
  cls AS (
    SELECT b.*, public.is_clic_automatico(b.sec, g.n_url::int) AS automatico
    FROM base b
    JOIN g ON g.destinatario_id = b.destinatario_id AND g.finestra = b.finestra
  )
  SELECT destinatario_id,
         count(*) FILTER (WHERE NOT automatico)::int AS clic_reali,
         count(*) FILTER (WHERE automatico)::int AS clic_auto,
         max(created_at) FILTER (WHERE NOT automatico) AS ultimo_clic_reale
  FROM cls
  GROUP BY destinatario_id
$$;

GRANT EXECUTE ON FUNCTION public.get_clic_destinatari(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clic_destinatari(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_clic_destinatari(uuid) TO supabase_read_only_user;