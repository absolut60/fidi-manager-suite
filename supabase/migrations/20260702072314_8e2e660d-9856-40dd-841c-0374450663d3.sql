-- Nuova configurazione: spese di insoluto per RiBa (importo unitario in EUR)
INSERT INTO public.configurazioni (chiave, valore, descrizione)
VALUES (
  'spese_insoluto_riba_eur',
  '3.00',
  'Importo unitario delle spese di insoluto RiBa, sommato al totale del sollecito per ciascuna scadenza il cui codice di pagamento inizia con RB (default 3,00 €).'
)
ON CONFLICT (chiave) DO NOTHING;

-- Nel template "Messa in mora" l'ammontare complessivo deve includere le spese
-- di insoluto: aggiorno il placeholder per usare il totale da pagare.
UPDATE public.template_email
SET corpo = REPLACE(
  corpo,
  'per un ammontare complessivo di <strong>{{totale_scaduto}}</strong>',
  'per un ammontare complessivo di <strong>{{totale_da_pagare}}</strong>'
)
WHERE tipo = 'messa_in_mora'
  AND corpo LIKE '%per un ammontare complessivo di <strong>{{totale_scaduto}}</strong>%';