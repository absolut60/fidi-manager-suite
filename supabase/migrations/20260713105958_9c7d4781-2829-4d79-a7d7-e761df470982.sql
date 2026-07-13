ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agente';
ALTER TABLE public.profili ADD COLUMN IF NOT EXISTS codice_agente text NULL;
COMMENT ON COLUMN public.profili.codice_agente IS 'Collegamento al codice agente (agenti.codice / clienti.codice_agente). Valorizzato solo per utenti con ruolo agente.';