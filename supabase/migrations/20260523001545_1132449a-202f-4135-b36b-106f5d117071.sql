-- Estendi l'enum stato_richiesta con stati granulari
ALTER TYPE public.stato_richiesta ADD VALUE IF NOT EXISTS 'in_attesa_liv1';
ALTER TYPE public.stato_richiesta ADD VALUE IF NOT EXISTS 'in_attesa_liv2';
ALTER TYPE public.stato_richiesta ADD VALUE IF NOT EXISTS 'in_attesa_liv3';
ALTER TYPE public.stato_richiesta ADD VALUE IF NOT EXISTS 'integrazioni_richieste';