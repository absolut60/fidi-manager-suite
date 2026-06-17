
-- Drop il FK esistente di approvato_da verso auth.users (se presente) e ripuntalo a profili,
-- cosi i join PostgREST profili!richieste_fido_(created_by|approvato_da)_fkey funzionano.

ALTER TABLE public.richieste_fido
  DROP CONSTRAINT IF EXISTS richieste_fido_approvato_da_fkey;

ALTER TABLE public.richieste_fido
  ADD CONSTRAINT richieste_fido_approvato_da_fkey
  FOREIGN KEY (approvato_da) REFERENCES public.profili(id) ON DELETE SET NULL;

ALTER TABLE public.richieste_fido
  DROP CONSTRAINT IF EXISTS richieste_fido_created_by_fkey;

ALTER TABLE public.richieste_fido
  ADD CONSTRAINT richieste_fido_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profili(id) ON DELETE SET NULL;
