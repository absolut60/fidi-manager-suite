CREATE OR REPLACE VIEW public.v_whatsapp_opt_in_attuale AS
WITH soggetti AS (
  SELECT DISTINCT
    contatto_id,
    cliente_id,
    lead_id,
    COALESCE(contatto_id::text, cliente_id::text, lead_id::text) AS soggetto_key
  FROM public.consensi_log
  WHERE tipo_consenso IN ('whatsapp', 'marketing_diretto')
),
abilitanti AS (
  SELECT
    COALESCE(contatto_id::text, cliente_id::text, lead_id::text) AS soggetto_key,
    MAX(created_at) AS ultimo_abilitante_at
  FROM public.consensi_log
  WHERE tipo_consenso IN ('whatsapp', 'marketing_diretto')
    AND valore = true
  GROUP BY COALESCE(contatto_id::text, cliente_id::text, lead_id::text)
),
stop_whatsapp AS (
  SELECT
    COALESCE(contatto_id::text, cliente_id::text, lead_id::text) AS soggetto_key,
    MAX(created_at) AS ultimo_stop_at
  FROM public.consensi_log
  WHERE tipo_consenso = 'whatsapp'
    AND valore = false
  GROUP BY COALESCE(contatto_id::text, cliente_id::text, lead_id::text)
)
SELECT
  s.contatto_id,
  s.cliente_id,
  s.lead_id,
  (a.ultimo_abilitante_at IS NOT NULL
   AND (w.ultimo_stop_at IS NULL OR w.ultimo_stop_at < a.ultimo_abilitante_at)
  ) AS opt_in,
  GREATEST(a.ultimo_abilitante_at, COALESCE(w.ultimo_stop_at, a.ultimo_abilitante_at)) AS aggiornato_at
FROM soggetti s
LEFT JOIN abilitanti a ON a.soggetto_key = s.soggetto_key
LEFT JOIN stop_whatsapp w ON w.soggetto_key = s.soggetto_key;

GRANT SELECT ON public.v_whatsapp_opt_in_attuale TO authenticated;
GRANT SELECT ON public.v_whatsapp_opt_in_attuale TO service_role;
GRANT SELECT ON public.v_whatsapp_opt_in_attuale TO supabase_read_only_user;