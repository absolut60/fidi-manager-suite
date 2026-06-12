CREATE OR REPLACE FUNCTION public.get_clienti_avvisati()
RETURNS TABLE(
  cliente_id uuid,
  n_azioni integer,
  ha_email boolean,
  ultima_tipo text,
  ultima_data timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH aperte AS (
    SELECT s.id, s.cliente_id
    FROM public.scadenze s
    WHERE
      -- stessa logica di classificaScadenza: tutto cio che NON e "pagato"
      lower(coalesce(s.tempi_scadenza, '')) LIKE '%scader%'
      OR lower(coalesce(s.tempi_scadenza, '')) LIKE '%scadut%'
      OR (
        lower(coalesce(s.tempi_scadenza, '')) NOT LIKE '%pagat%'
        AND s.stato_contabile = 'Aperta'
      )
  ),
  azioni_linked AS (
    SELECT DISTINCT a.id, a.cliente_id, a.tipo::text AS tipo, a.data_azione
    FROM public.azioni_recupero a
    JOIN public.azioni_recupero_scadenze ars ON ars.azione_id = a.id
    JOIN aperte ap ON ap.id = ars.scadenza_id AND ap.cliente_id = a.cliente_id
  )
  SELECT
    al.cliente_id,
    COUNT(*)::int AS n_azioni,
    bool_or(al.tipo = 'email') AS ha_email,
    (ARRAY_AGG(al.tipo ORDER BY al.data_azione DESC))[1] AS ultima_tipo,
    MAX(al.data_azione) AS ultima_data
  FROM azioni_linked al
  GROUP BY al.cliente_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_clienti_avvisati() TO authenticated;