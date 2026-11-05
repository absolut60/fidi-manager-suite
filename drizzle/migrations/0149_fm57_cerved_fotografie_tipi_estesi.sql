ALTER TABLE public.cerved_fotografie DROP CONSTRAINT IF EXISTS cerved_fotografie_tipo_check;
ALTER TABLE public.cerved_fotografie ADD CONSTRAINT cerved_fotografie_tipo_check
  CHECK (tipo IN ('ricerca','profilo','score','light_report','bilancio','eventi_negativi','fido'));