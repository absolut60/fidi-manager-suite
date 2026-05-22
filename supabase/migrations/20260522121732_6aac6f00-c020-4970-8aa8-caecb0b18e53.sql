
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS codice_assegnato text,
  ADD COLUMN IF NOT EXISTS sede_operatore text,
  ADD COLUMN IF NOT EXISTS condizioni_pagamento_concordate text,
  ADD COLUMN IF NOT EXISTS data_richiesta_affidamento date,
  ADD COLUMN IF NOT EXISTS importo_affidamento_richiesto numeric,
  ADD COLUMN IF NOT EXISTS data_esito_affidamento date,
  ADD COLUMN IF NOT EXISTS importo_affidato numeric,
  ADD COLUMN IF NOT EXISTS fido_aziendale_concesso numeric,
  ADD COLUMN IF NOT EXISTS condizioni_pagamento_concesse text,
  ADD COLUMN IF NOT EXISTS data_affidamento_aziendale date,
  ADD COLUMN IF NOT EXISTS note_amministrazione text;
