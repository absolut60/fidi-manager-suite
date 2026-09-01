ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'preventivi_read';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'preventivi_write';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'preventivi_manage';