CREATE OR REPLACE FUNCTION public.get_cruscotto_incassi_mese_scadenze(_anno integer, _mese integer)
RETURNS TABLE(
  cliente_id uuid,
  ragione_sociale text,
  codice_gestionale text,
  in_gestione_legale boolean,
  bloccato boolean,
  email text,
  pec text,
  scadenza_id uuid,
  numero_documento text,
  data_scadenza date,
  importo_scadenza numeric,
  importo_pagato numeric,
  quota_incassata numeric,
  residuo numeric,
  scaduta boolean,
  codice_pagamento text,
  metodo_descrizione text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH d1 AS (SELECT make_date(_anno, _mese, 1) AS d),
  d AS (SELECT d, (d + interval '1 month')::date AS d_next FROM d1)
  SELECT
    c.id AS cliente_id,
    c.ragione_sociale,
    c.codice_gestionale,
    COALESCE(c.in_gestione_legale, false),
    COALESCE(c.bloccato, false),
    c.email,
    c.pec,
    s.id AS scadenza_id,
    s.numero_documento,
    s.data_scadenza,
    COALESCE(s.importo_scadenza, 0)::numeric,
    COALESCE(s.importo_pagato, 0)::numeric,
    CASE
      WHEN s.data_pagamento_effettiva IS NOT NULL AND COALESCE(s.importo_pagato, 0) > 0
        THEN COALESCE(s.importo_pagato, 0)
      ELSE 0
    END::numeric AS quota_incassata,
    GREATEST(COALESCE(s.importo_scadenza, 0) - COALESCE(s.importo_pagato, 0), 0)::numeric AS residuo,
    (s.data_scadenza < CURRENT_DATE) AS scaduta,
    s.codice_pagamento,
    cp.descrizione AS metodo_descrizione
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.codici_pagamento cp ON cp.cod = s.codice_pagamento
  , d
  WHERE s.data_scadenza >= d.d
    AND s.data_scadenza < d.d_next
    AND COALESCE(s.importo_scadenza, 0) <> 0
    AND public.user_can_access_cliente(c.id);
$function$;

GRANT EXECUTE ON FUNCTION public.get_cruscotto_incassi_mese_scadenze(integer, integer) TO authenticated, service_role;