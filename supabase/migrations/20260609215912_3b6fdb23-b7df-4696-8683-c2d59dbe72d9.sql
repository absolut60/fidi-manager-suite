CREATE INDEX IF NOT EXISTS idx_scadenze_stato_cliente
  ON public.scadenze (stato_contabile, cliente_id, data_scadenza);

CREATE INDEX IF NOT EXISTS idx_scadenze_stato_ritardo
  ON public.scadenze (stato_contabile, giorni_ritardo)
  WHERE stato_contabile = 'Aperta';

CREATE INDEX IF NOT EXISTS idx_clienti_store_id
  ON public.clienti (store_id, id);

CREATE INDEX IF NOT EXISTS idx_clienti_blocco_legale
  ON public.clienti (bloccato, in_gestione_legale)
  WHERE bloccato = true OR in_gestione_legale = true;

CREATE INDEX IF NOT EXISTS idx_scadenze_aperte_data
  ON public.scadenze (data_scadenza, cliente_id)
  WHERE stato_contabile = 'Aperta';

CREATE INDEX IF NOT EXISTS idx_scadenze_cliente_stato_blocco
  ON public.scadenze (cliente_id, stato_contabile, cod_blocco);

CREATE INDEX IF NOT EXISTS idx_scadenze_cliente_stato_legale
  ON public.scadenze (cliente_id, stato_contabile, in_legale);