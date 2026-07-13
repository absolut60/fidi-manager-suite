-- Nuove chiavi: filtro METODI (restrittivo), distinto dalle esclusioni.
INSERT INTO public.configurazioni (chiave, valore) VALUES
  ('promemoria_scadenza_includi_bonifici', 'true'),
  ('promemoria_scadenza_includi_riba', 'true')
ON CONFLICT (chiave) DO NOTHING;

-- Estende la RPC con 2 nuovi parametri (retro-compatibili: default true/true).
-- Il filtro METODI si affianca (non sostituisce) al filtro BOS esistente.
CREATE OR REPLACE FUNCTION public.get_promemoria_scadenze_dettaglio(
  _data date,
  _escludi_legale boolean DEFAULT true,
  _escludi_bloccati boolean DEFAULT false,
  _escludi_bos boolean DEFAULT true,
  _includi_bonifici boolean DEFAULT true,
  _includi_riba boolean DEFAULT true
)
RETURNS TABLE (
  scadenza_id uuid,
  cliente_id uuid,
  ragione_sociale text,
  email text,
  pec text,
  store_id uuid,
  store_nome text,
  store_insegna text,
  store_indirizzo text,
  store_cap text,
  store_citta text,
  store_provincia text,
  store_telefono text,
  numero_documento text,
  data_documento date,
  data_scadenza date,
  importo_scadenza numeric,
  codice_pagamento text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id AS scadenza_id,
    c.id AS cliente_id,
    c.ragione_sociale,
    c.email,
    c.pec,
    c.store_id,
    st.nome AS store_nome,
    st.insegna AS store_insegna,
    st.indirizzo AS store_indirizzo,
    st.cap AS store_cap,
    st.citta AS store_citta,
    st.provincia AS store_provincia,
    st.telefono AS store_telefono,
    s.numero_documento,
    s.data_documento,
    s.data_scadenza,
    s.importo_scadenza,
    s.codice_pagamento
  FROM public.scadenze s
  JOIN public.clienti c ON c.id = s.cliente_id
  LEFT JOIN public.stores st ON st.id = c.store_id
  WHERE s.data_pagamento_effettiva IS NULL
    AND s.data_scadenza = _data
    AND COALESCE(s.importo_scadenza, 0) > 0
    AND (_escludi_legale IS FALSE OR COALESCE(s.in_legale, false) = false)
    AND (_escludi_bloccati IS FALSE OR COALESCE(c.bloccato, false) = false)
    AND (_escludi_bos IS FALSE OR COALESCE(s.codice_pagamento, '') NOT ILIKE 'BOS%')
    AND (
      (_includi_bonifici AND COALESCE(s.codice_pagamento, '') ILIKE 'BO%')
      OR (_includi_riba AND COALESCE(s.codice_pagamento, '') ILIKE 'RB%')
    )
  ORDER BY c.ragione_sociale ASC, s.data_scadenza ASC, s.numero_documento ASC;
$$;

REVOKE ALL ON FUNCTION public.get_promemoria_scadenze_dettaglio(date, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_promemoria_scadenze_dettaglio(date, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

-- Rimuove la vecchia firma (4 args) per evitare ambiguita' di overload:
-- tutti i chiamanti passano i 2 nuovi parametri.
DROP FUNCTION IF EXISTS public.get_promemoria_scadenze_dettaglio(date, boolean, boolean, boolean);