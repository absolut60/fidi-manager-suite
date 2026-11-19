ALTER TABLE public.cerved_report
  ADD COLUMN stato text NOT NULL DEFAULT 'consegnato' CHECK (stato IN ('in_attesa', 'consegnato', 'bloccato')),
  ADD COLUMN tentativi_recupero int NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_tentativo_il timestamptz,
  ADD COLUMN ultimo_esito_cerved text,
  ADD COLUMN consegnato_il timestamptz;

UPDATE public.cerved_report r
SET stato = 'consegnato', consegnato_il = f.prima_fotografia
FROM (SELECT cliente_id, min(letta_il) AS prima_fotografia FROM public.cerved_fotografie WHERE tipo = 'light_report' GROUP BY cliente_id) f
WHERE f.cliente_id = r.cliente_id;

UPDATE public.cerved_report r
SET stato = 'in_attesa', ultimo_esito_cerved = 'DOCUMENT NOT READY'
WHERE NOT EXISTS (SELECT 1 FROM public.cerved_fotografie f WHERE f.cliente_id = r.cliente_id AND f.tipo = 'light_report');

CREATE FUNCTION public.registra_tentativo_recupero_cerved(_report_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE public.cerved_report SET tentativi_recupero = tentativi_recupero + 1, ultimo_tentativo_il = now() WHERE id = _report_id;
$$;
REVOKE EXECUTE ON FUNCTION public.registra_tentativo_recupero_cerved(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_tentativo_recupero_cerved(uuid) TO service_role;