ALTER TABLE public.fornitori
  ADD COLUMN origine text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('manuale','gamma')),
  ADD COLUMN codice_gestionale integer UNIQUE,
  ADD COLUMN codice_anagrafica_generale integer,
  ADD COLUMN codice_cliente_gamma integer,
  ADD COLUMN alias text, ADD COLUMN partita_iva text, ADD COLUMN codice_fiscale text,
  ADD COLUMN indirizzo text, ADD COLUMN cap text, ADD COLUMN citta text, ADD COLUMN provincia text, ADD COLUMN stato text,
  ADD COLUMN telefono text, ADD COLUMN telefono_2 text, ADD COLUMN cellulare text, ADD COLUMN fax text,
  ADD COLUMN email text, ADD COLUMN sito text, ADD COLUMN pec text,
  ADD COLUMN persona_fisica boolean, ADD COLUMN valida boolean,
  ADD COLUMN condizione_pagamento_cod text, ADD COLUMN condizione_pagamento_desc text,
  ADD COLUMN attivo boolean NOT NULL DEFAULT true,
  ADD COLUMN ultima_modifica_gamma timestamptz, ADD COLUMN ultima_sincronizzazione timestamptz;

CREATE INDEX fornitori_partita_iva_idx ON public.fornitori (partita_iva);
CREATE INDEX fornitori_codice_fiscale_idx ON public.fornitori (codice_fiscale);
CREATE INDEX fornitori_codice_anagrafica_generale_idx ON public.fornitori (codice_anagrafica_generale);

ALTER TABLE public.fornitori DROP CONSTRAINT fornitori_nome_key;
CREATE UNIQUE INDEX fornitori_nome_manuale_uniq ON public.fornitori (lower(trim(nome))) WHERE origine = 'manuale';

CREATE TABLE public.fornitore_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornitore_id uuid NOT NULL REFERENCES public.fornitori(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  origine text NOT NULL CHECK (origine IN ('gamma','piva_cf','manuale')),
  coincide_su text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornitore_id, cliente_id)
);
CREATE INDEX fornitore_cliente_fornitore_idx ON public.fornitore_cliente (fornitore_id);
CREATE INDEX fornitore_cliente_cliente_idx ON public.fornitore_cliente (cliente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornitore_cliente TO authenticated;
GRANT ALL ON public.fornitore_cliente TO service_role;
ALTER TABLE public.fornitore_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Secondo fattore (FM44)" ON public.fornitore_cliente AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.auth_mfa_ok())) WITH CHECK ((SELECT public.auth_mfa_ok()));
CREATE POLICY fornitore_cliente_select ON public.fornitore_cliente FOR SELECT TO authenticated USING (true);
CREATE POLICY fornitore_cliente_prev_write ON public.fornitore_cliente FOR ALL TO authenticated
  USING (public.auth_puo_gestire_anagrafiche_prev()) WITH CHECK (public.auth_puo_gestire_anagrafiche_prev());

CREATE OR REPLACE FUNCTION public.ricalcola_collegamenti_fornitori_clienti()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gamma integer;
  v_piva integer;
BEGIN
  DELETE FROM public.fornitore_cliente WHERE origine IN ('gamma','piva_cf');

  INSERT INTO public.fornitore_cliente (fornitore_id, cliente_id, origine)
  SELECT f.id, c.id, 'gamma'
  FROM public.fornitori f
  JOIN public.clienti c ON trim(c.codice_gestionale) = f.codice_cliente_gamma::text
  WHERE f.origine = 'gamma' AND f.codice_cliente_gamma IS NOT NULL
  ON CONFLICT (fornitore_id, cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_gamma = ROW_COUNT;

  WITH f AS MATERIALIZED (
    SELECT id,
      NULLIF(upper(trim(partita_iva)), '') AS piva,
      NULLIF(upper(trim(codice_fiscale)), '') AS cf
    FROM public.fornitori WHERE origine = 'gamma'
  ), c AS MATERIALIZED (
    SELECT id,
      NULLIF(upper(trim(partita_iva)), '') AS piva,
      NULLIF(upper(trim(codice_fiscale)), '') AS cf
    FROM public.clienti
  ), coppie AS (
    SELECT f.id AS fid, c.id AS cid,
      (f.piva IS NOT NULL AND f.piva !~ '^0+$' AND f.piva = c.piva) AS su_piva,
      (f.cf IS NOT NULL AND f.cf !~ '^0+$' AND f.cf = c.cf) AS su_cf
    FROM f JOIN c ON (f.piva IS NOT NULL AND f.piva !~ '^0+$' AND f.piva = c.piva)
                  OR (f.cf IS NOT NULL AND f.cf !~ '^0+$' AND f.cf = c.cf)
  )
  INSERT INTO public.fornitore_cliente (fornitore_id, cliente_id, origine, coincide_su)
  SELECT fid, cid, 'piva_cf',
    CASE WHEN su_piva AND su_cf THEN 'piva+cf' WHEN su_piva THEN 'piva' ELSE 'cf' END
  FROM coppie
  ON CONFLICT (fornitore_id, cliente_id) DO NOTHING;
  GET DIAGNOSTICS v_piva = ROW_COUNT;

  RETURN jsonb_build_object('collegamenti_gamma', v_gamma, 'collegamenti_piva_cf', v_piva);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ricalcola_collegamenti_fornitori_clienti() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ricalcola_collegamenti_fornitori_clienti() TO service_role;