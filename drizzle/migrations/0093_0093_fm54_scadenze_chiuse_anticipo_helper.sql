CREATE OR REPLACE FUNCTION public.scadenza_chiusa_anticipata(_stato_contabile text, _data_pagamento_effettiva date, _tempi_scadenza_key text, _importo_pagato numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(_stato_contabile = 'Chiusa'
    AND _data_pagamento_effettiva IS NULL
    AND _tempi_scadenza_key = 'Pagate'
    AND COALESCE(_importo_pagato, 0) > 0, false)
$$;
COMMENT ON FUNCTION public.scadenza_chiusa_anticipata(text, date, text, numeric) IS 'FM54: fonte unica "rata chiusa in anticipo da Gamma" (Chiusa, senza data pagamento, tempi Pagate, importo pagato > 0) = pagata. Gemello del TypeScript.';

CREATE OR REPLACE FUNCTION public.categoria_scadenza_riga(_stato_contabile text, _data_scadenza date, _data_pagamento_effettiva date, _giorni_ritardo integer, _oggi date, _tempi_scadenza_key text, _importo_pagato numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN public.scadenza_chiusa_anticipata(_stato_contabile, _data_pagamento_effettiva, _tempi_scadenza_key, _importo_pagato) THEN 'pagato'
    ELSE public.categoria_scadenza(_stato_contabile, _data_scadenza, _data_pagamento_effettiva, _giorni_ritardo, _oggi) END
$$;
COMMENT ON FUNCTION public.categoria_scadenza_riga(text, date, date, integer, date, text, numeric) IS 'FM54: categoria_scadenza con le rate chiuse in anticipo da Gamma trattate come pagate.';

REVOKE EXECUTE ON FUNCTION public.scadenza_chiusa_anticipata(text, date, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.categoria_scadenza_riga(text, date, date, integer, date, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scadenza_chiusa_anticipata(text, date, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.categoria_scadenza_riga(text, date, date, integer, date, text, numeric) TO authenticated, service_role;