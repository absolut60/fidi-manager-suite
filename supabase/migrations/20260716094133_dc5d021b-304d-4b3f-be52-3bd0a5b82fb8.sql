ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'richiedente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'approvatore_richieste_liv1';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'approvatore_richieste_liv2';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestore_richieste';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'esecutore_richieste';