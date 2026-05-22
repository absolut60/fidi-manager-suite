alter table public.clienti
  add column if not exists condizione_pagamento_cod  text,
  add column if not exists condizione_pagamento_desc text,
  add column if not exists saldo_contabile           numeric(12,2) default 0,
  add column if not exists doc_da_fatturare          numeric(12,2) default 0,
  add column if not exists doc_da_evadere            numeric(12,2) default 0,
  add column if not exists effetti_a_rischio         numeric(12,2) default 0,
  add column if not exists fido_gestionale           numeric(12,2) default 0,
  add column if not exists num_insoluti              int default 0,
  add column if not exists ultima_sincronizzazione   timestamptz;

create index if not exists idx_clienti_codice_gestionale on public.clienti(codice_gestionale);
create index if not exists idx_clienti_attivo on public.clienti(attivo);

create or replace view public.clienti_con_rischio as
select
  c.*,
  case
    when c.fido_residuo < 0                          then 'rosso'
    when c.fido_residuo < (c.fido_gestionale * 0.1) then 'arancione'
    when c.scaduto > 0                               then 'giallo'
    else                                                  'verde'
  end as semaforo_rischio,
  case
    when c.fido_gestionale > 0
    then round((c.totale_rischio / c.fido_gestionale * 100)::numeric, 1)
    else 0
  end as percentuale_utilizzo_fido
from public.clienti c;

comment on view public.clienti_con_rischio is
  'Clienti arricchiti con semaforo rischio e percentuale utilizzo fido';