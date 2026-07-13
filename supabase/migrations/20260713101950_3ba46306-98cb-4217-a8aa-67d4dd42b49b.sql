CREATE TABLE IF NOT EXISTS public.agenti (
    codice text PRIMARY KEY NOT NULL,
    descrizione text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agenti TO authenticated;
GRANT ALL ON public.agenti TO service_role;

ALTER TABLE public.agenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutti gli utenti autenticati possono leggere agenti" ON public.agenti;
CREATE POLICY "Tutti gli utenti autenticati possono leggere agenti" 
ON public.agenti FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Solo admin può gestire agenti" ON public.agenti;
CREATE POLICY "Solo admin può gestire agenti" 
ON public.agenti FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'amministratore')) 
WITH CHECK (public.has_role(auth.uid(), 'amministratore'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_agenti_updated_at ON public.agenti;
CREATE TRIGGER update_agenti_updated_at
    BEFORE UPDATE ON public.agenti
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clienti ADD COLUMN IF NOT EXISTS codice_agente text NULL;
ALTER TABLE public.clienti ADD COLUMN IF NOT EXISTS agente text NULL;