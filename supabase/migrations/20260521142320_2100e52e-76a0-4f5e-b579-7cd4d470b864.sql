-- Tipo di richiesta fido
CREATE TYPE public.tipo_richiesta AS ENUM ('nuovo', 'aumento', 'diminuzione', 'rinnovo');

ALTER TABLE public.richieste_fido
  ADD COLUMN tipo public.tipo_richiesta NOT NULL DEFAULT 'nuovo';

CREATE INDEX idx_richieste_fido_tipo ON public.richieste_fido(tipo);