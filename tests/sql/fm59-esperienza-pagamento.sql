-- FM59: prove in sola lettura, eseguire con postgres o service_role.
WITH casi(nome, codice, documento, pagamento, scadenza, importo, atteso) AS (
  VALUES
    ('RiBa puntuale', 'RB30', 'FATTURA', DATE '2026-11-01', DATE '2026-11-01', 100::numeric, 0),
    ('RiBa tardiva', 'rb60', 'FATTURA', DATE '2026-11-21', DATE '2026-11-01', 100::numeric, 20),
    ('Bonifico anticipato', 'BB', 'FATTURA', DATE '2026-10-20', DATE '2026-11-01', 100::numeric, 0),
    ('RiBa anticipata', 'RB30', 'FATTURA', DATE '2026-10-20', DATE '2026-11-01', 100::numeric, 0),
    ('Bonifico tardivo', 'BB', 'FATTURA', DATE '2026-11-21', DATE '2026-11-01', 100::numeric, 20),
    ('Documento ANTICIPO', 'RB30', 'FATTURA anticipo 1', DATE '2026-11-21', DATE '2026-11-01', 100::numeric, NULL::int),
    ('Pagamento assente', 'BB', 'FATTURA', NULL::date, DATE '2026-11-01', 100::numeric, NULL::int),
    ('Scadenza assente', 'BB', 'FATTURA', DATE '2026-11-01', NULL::date, 100::numeric, NULL::int),
    ('Importo assente', 'BB', 'FATTURA', DATE '2026-11-01', DATE '2026-11-01', NULL::numeric, NULL::int),
    ('Importo zero', 'BB', 'FATTURA', DATE '2026-11-01', DATE '2026-11-01', 0::numeric, NULL::int),
    ('Importo negativo', 'BB', 'FATTURA', DATE '2026-11-01', DATE '2026-11-01', -1::numeric, NULL::int)
)
SELECT nome, atteso,
  public.ritardo_pagamento_riga(codice, documento, pagamento, scadenza, importo) AS ottenuto,
  public.ritardo_pagamento_riga(codice, documento, pagamento, scadenza, importo) IS NOT DISTINCT FROM atteso AS ok
FROM casi;

-- Confronto prima_pagata con la definizione di Andrea su 20 clienti reali.
WITH ids AS (SELECT id FROM public.clienti ORDER BY id LIMIT 20),
attesi AS (
  SELECT i.id, MIN(s.data_scadenza) FILTER (WHERE s.data_pagamento_effettiva IS NOT NULL
    AND s.data_scadenza IS NOT NULL AND s.importo_pagato > 0
    AND NOT public.is_anticipo(s.numero_documento)) AS prima_pagata
  FROM ids i LEFT JOIN public.scadenze s ON s.cliente_id = i.id GROUP BY i.id
)
SELECT e.cliente_id, e.prima_pagata, a.prima_pagata AS atteso,
  e.prima_pagata IS NOT DISTINCT FROM a.prima_pagata AS ok
FROM public.esperienza_pagamento_batch(ARRAY(SELECT id FROM ids)) e
JOIN attesi a ON a.id = e.cliente_id;