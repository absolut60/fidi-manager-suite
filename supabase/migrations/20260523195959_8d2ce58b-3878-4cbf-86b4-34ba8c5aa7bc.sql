ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS ultima_data_fatturazione date,
  ADD COLUMN IF NOT EXISTS cliente_attivo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ind_blocco integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clienti_cliente_attivo ON public.clienti(cliente_attivo);
CREATE INDEX IF NOT EXISTS idx_clienti_ind_blocco ON public.clienti(ind_blocco);