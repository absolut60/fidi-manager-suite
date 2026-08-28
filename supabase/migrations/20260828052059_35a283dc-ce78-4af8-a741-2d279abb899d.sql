ALTER TABLE public.azioni_recupero DROP CONSTRAINT azioni_recupero_tipo_check;
ALTER TABLE public.azioni_recupero ADD CONSTRAINT azioni_recupero_tipo_check
  CHECK (tipo = ANY (ARRAY['email'::text, 'telefonata'::text, 'promemoria'::text, 'nota'::text, 'lettera'::text, 'promemoria_scadenza'::text, 'sinistro_assicurazione'::text]));