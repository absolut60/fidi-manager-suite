CREATE OR REPLACE FUNCTION public.get_campagne_entita(_cliente_id uuid DEFAULT NULL, _lead_id uuid DEFAULT NULL)
RETURNS TABLE(
  campagna_id uuid, campagna_nome text, campagna_oggetto text, campagna_stato text, campagna_inviata_at timestamptz,
  destinatario_id uuid, email text, tipo_destinatario text, stato_invio text, inviato_at timestamptz,
  num_clic int, ultimo_clic_at timestamptz, errore text,
  canale text,
  contatto_id uuid, contatto_nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT d.id AS destinatario_id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'cliente'::text AS canale
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.cliente_id = _cliente_id

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'cliente'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c WHERE c.cliente_id = _cliente_id AND c.lead_id IS NULL
    )

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'lead'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c
      WHERE c.lead_id IN (SELECT l.id FROM public.lead l WHERE l.cliente_id = _cliente_id)
    )

    UNION ALL

    SELECT d.id, d.campagna_id, d.email, d.tipo_destinatario, d.stato_invio,
           d.inviato_at, d.num_clic, d.ultimo_clic_at, d.errore, d.contatto_id,
           'lead'::text
    FROM public.campagne_email_destinatari d
    WHERE _cliente_id IS NULL AND _lead_id IS NOT NULL AND d.contatto_id IN (
      SELECT c.id FROM public.contatti c WHERE c.lead_id = _lead_id
    )
  ),
  dedup AS (
    SELECT DISTINCT ON (b.destinatario_id) b.*
    FROM base b
    ORDER BY b.destinatario_id, (CASE WHEN b.canale = 'cliente' THEN 0 ELSE 1 END)
  )
  SELECT
    m.id, m.nome, m.oggetto, m.stato, m.inviata_at,
    x.destinatario_id, x.email, x.tipo_destinatario, x.stato_invio, x.inviato_at,
    x.num_clic, x.ultimo_clic_at, x.errore,
    x.canale,
    x.contatto_id,
    NULLIF(btrim(concat_ws(' ', c.nome, c.cognome)), '') AS contatto_nome
  FROM dedup x
  JOIN public.campagne_email_marketing m ON m.id = x.campagna_id
  LEFT JOIN public.contatti c ON c.id = x.contatto_id
  ORDER BY m.inviata_at DESC NULLS LAST, x.inviato_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_campagne_entita(uuid, uuid) TO authenticated, service_role, supabase_read_only_user;

CREATE OR REPLACE FUNCTION public.get_riassunto_campagne_entita(_cliente_id uuid DEFAULT NULL, _lead_id uuid DEFAULT NULL)
RETURNS TABLE(n_campagne bigint, n_inviate bigint, n_cliccate bigint, ultima_campagna_nome text, ultima_campagna_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.get_campagne_entita(_cliente_id, _lead_id)
  )
  SELECT
    count(DISTINCT r.campagna_id)::bigint,
    count(*) FILTER (WHERE r.stato_invio = 'inviato')::bigint,
    count(*) FILTER (WHERE COALESCE(r.num_clic, 0) > 0)::bigint,
    (SELECT r2.campagna_nome FROM r r2 WHERE r2.campagna_inviata_at IS NOT NULL
       ORDER BY r2.campagna_inviata_at DESC LIMIT 1),
    (SELECT max(r3.campagna_inviata_at) FROM r r3)
  FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.get_riassunto_campagne_entita(uuid, uuid) TO authenticated, service_role, supabase_read_only_user;