ALTER TABLE public.consensi_log DROP CONSTRAINT consensi_log_tipo_consenso_check;
ALTER TABLE public.consensi_log
  ADD CONSTRAINT consensi_log_tipo_consenso_check
  CHECK (tipo_consenso = ANY (ARRAY['marketing_diretto','marketing_media','profilazione','whatsapp']));