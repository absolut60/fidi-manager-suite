CREATE TABLE public.clienti_blocco_stato (
  cliente_id uuid PRIMARY KEY REFERENCES public.clienti(id) ON DELETE CASCADE,
  bloccato boolean NOT NULL,
  aggiornato_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clienti_blocco_stato TO service_role;
ALTER TABLE public.clienti_blocco_stato ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clienti_blocco_variazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  codice_gestionale text NULL,
  ragione_sociale text NULL,
  tipo text NOT NULL CHECK (tipo IN ('bloccato','sbloccato')),
  importazione_id uuid NULL REFERENCES public.importazioni(id) ON DELETE SET NULL,
  rilevato_at timestamptz NOT NULL DEFAULT now(),
  notificato_at timestamptz NULL
);
CREATE INDEX idx_cbv_store_rilevato ON public.clienti_blocco_variazioni (store_id, rilevato_at DESC);
CREATE INDEX idx_cbv_cliente_rilevato ON public.clienti_blocco_variazioni (cliente_id, rilevato_at DESC);
CREATE INDEX idx_cbv_non_notificate ON public.clienti_blocco_variazioni (rilevato_at) WHERE notificato_at IS NULL;
GRANT SELECT ON public.clienti_blocco_variazioni TO authenticated;
GRANT ALL ON public.clienti_blocco_variazioni TO service_role;
ALTER TABLE public.clienti_blocco_variazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lettura variazioni blocco per accesso cliente"
  ON public.clienti_blocco_variazioni FOR SELECT TO authenticated
  USING (public.user_can_access_cliente(cliente_id, store_id, NULL));

CREATE OR REPLACE FUNCTION public.rileva_variazioni_blocco(_importazione_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('rileva_variazioni_blocco'));

  INSERT INTO public.clienti_blocco_variazioni (cliente_id, store_id, codice_gestionale, ragione_sociale, tipo, importazione_id)
  SELECT c.id, c.store_id, c.codice_gestionale, c.ragione_sociale,
         CASE WHEN COALESCE(c.bloccato,false) THEN 'bloccato' ELSE 'sbloccato' END,
         _importazione_id
  FROM public.clienti c
  LEFT JOIN public.clienti_blocco_stato s ON s.cliente_id = c.id
  WHERE (s.cliente_id IS NOT NULL AND COALESCE(c.bloccato,false) IS DISTINCT FROM s.bloccato)
     OR (s.cliente_id IS NULL AND COALESCE(c.bloccato,false) = true);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.clienti_blocco_stato (cliente_id, bloccato, aggiornato_at)
  SELECT id, COALESCE(bloccato,false), now() FROM public.clienti
  ON CONFLICT (cliente_id) DO UPDATE
    SET bloccato = EXCLUDED.bloccato, aggiornato_at = now()
    WHERE clienti_blocco_stato.bloccato IS DISTINCT FROM EXCLUDED.bloccato;

  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rileva_variazioni_blocco(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rileva_variazioni_blocco(uuid) TO service_role;

INSERT INTO public.clienti_blocco_stato (cliente_id, bloccato)
SELECT id, COALESCE(bloccato,false) FROM public.clienti
ON CONFLICT (cliente_id) DO NOTHING;