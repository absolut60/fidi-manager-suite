-- 0) consensi_log diventa fonte unica: contatto_id nullable + garanzia di almeno un soggetto.
ALTER TABLE public.consensi_log ALTER COLUMN contatto_id DROP NOT NULL;
ALTER TABLE public.consensi_log
  ADD CONSTRAINT consensi_log_almeno_un_soggetto
  CHECK (contatto_id IS NOT NULL OR cliente_id IS NOT NULL OR lead_id IS NOT NULL);

-- 1) Normalizzatore numero italiano
CREATE OR REPLACE FUNCTION public.normalizza_numero_it(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH cifre AS (SELECT regexp_replace(coalesce(_raw,''), '[^0-9]', '', 'g') AS d),
  norm AS (
    SELECT CASE
      WHEN length(d) = 12 AND left(d,2) = '39' THEN right(d,10)
      WHEN length(d) = 10 THEN d
      WHEN length(d) > 12 AND right(d,10) ~ '^3[0-9]{9}$' THEN right(d,10)
      ELSE NULL END AS n
    FROM cifre
  )
  SELECT CASE WHEN n ~ '^3[0-9]{9}$' THEN n ELSE NULL END FROM norm;
$$;

-- 2) Tabella iscritti WhatsApp
CREATE TABLE IF NOT EXISTS public.iscritti_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_norm text NOT NULL,
  numero_raw text NOT NULL,
  nome text, cognome text, email text,
  origine text NOT NULL DEFAULT 'link',
  stato text NOT NULL DEFAULT 'nuovo',
  cliente_id uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.lead(id) ON DELETE SET NULL,
  contatto_id uuid REFERENCES public.contatti(id) ON DELETE SET NULL,
  consenso_log_id uuid REFERENCES public.consensi_log(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.iscritti_whatsapp TO authenticated;
GRANT ALL ON public.iscritti_whatsapp TO service_role;
CREATE INDEX IF NOT EXISTS idx_iscritti_wa_numero ON public.iscritti_whatsapp(numero_norm);
CREATE INDEX IF NOT EXISTS idx_iscritti_wa_stato ON public.iscritti_whatsapp(stato);
CREATE INDEX IF NOT EXISTS idx_iscritti_wa_cliente ON public.iscritti_whatsapp(cliente_id);
CREATE INDEX IF NOT EXISTS idx_iscritti_wa_lead ON public.iscritti_whatsapp(lead_id);
CREATE INDEX IF NOT EXISTS idx_iscritti_wa_contatto ON public.iscritti_whatsapp(contatto_id);

ALTER TABLE public.iscritti_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY iscritti_wa_select ON public.iscritti_whatsapp
  FOR SELECT TO authenticated
  USING (public.auth_ha_ruolo_globale_clienti());

-- 3) Vista stato opt-in attuale
CREATE OR REPLACE VIEW public.v_whatsapp_opt_in_attuale
WITH (security_invoker = true) AS
SELECT DISTINCT ON (coalesce(contatto_id::text, cliente_id::text, lead_id::text))
  contatto_id, cliente_id, lead_id, valore AS opt_in, created_at AS aggiornato_at
FROM public.consensi_log
WHERE tipo_consenso = 'whatsapp'
ORDER BY coalesce(contatto_id::text, cliente_id::text, lead_id::text), created_at DESC;

-- 4) RPC unica
CREATE OR REPLACE FUNCTION public.registra_consenso_whatsapp(
  _numero_raw text, _nome text DEFAULT NULL, _cognome text DEFAULT NULL, _email text DEFAULT NULL,
  _origine text DEFAULT 'link', _ip text DEFAULT NULL, _user_agent text DEFAULT NULL,
  _informativa_versione text DEFAULT NULL, _informativa_hash text DEFAULT NULL, _secondi_permanenza int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text; v_cli_cnt int; v_cli uuid; v_lead_cnt int; v_lead uuid;
  v_log_id uuid; v_stato text; v_esito text;
BEGIN
  v_norm := public.normalizza_numero_it(_numero_raw);
  IF v_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'numero_non_valido');
  END IF;

  SELECT count(*), min(id) INTO v_cli_cnt, v_cli
  FROM public.clienti WHERE public.normalizza_numero_it(cellulare) = v_norm;
  IF v_cli_cnt <> 1 THEN v_cli := NULL; END IF;

  IF v_cli IS NULL THEN
    SELECT count(*), min(id) INTO v_lead_cnt, v_lead
    FROM public.lead WHERE public.normalizza_numero_it(cellulare) = v_norm;
    IF v_lead_cnt <> 1 THEN v_lead := NULL; END IF;
  END IF;

  IF v_cli IS NOT NULL OR v_lead IS NOT NULL THEN
    INSERT INTO public.consensi_log(
      contatto_id, cliente_id, lead_id, tipo_consenso, valore, origine,
      ip_address, user_agent, informativa_versione, informativa_hash, secondi_permanenza, note
    ) VALUES (
      NULL, v_cli, v_lead, 'whatsapp', true, _origine,
      _ip, _user_agent, _informativa_versione, _informativa_hash, _secondi_permanenza, 'Iscrizione WhatsApp'
    ) RETURNING id INTO v_log_id;
  END IF;

  v_stato := CASE
    WHEN v_cli IS NOT NULL THEN 'collegato_cliente'
    WHEN v_lead IS NOT NULL THEN 'collegato_lead'
    ELSE 'nuovo' END;
  v_esito := CASE WHEN v_cli IS NOT NULL OR v_lead IS NOT NULL THEN 'collegato' ELSE 'in_lista' END;

  INSERT INTO public.iscritti_whatsapp(
    numero_norm, numero_raw, nome, cognome, email, origine, stato, cliente_id, lead_id, consenso_log_id
  ) VALUES (
    v_norm, _numero_raw, _nome, _cognome, _email, _origine, v_stato, v_cli, v_lead, v_log_id
  );

  RETURN jsonb_build_object('ok', true, 'esito', v_esito, 'stato', v_stato, 'numero', v_norm);
END;
$$;

REVOKE ALL ON FUNCTION public.registra_consenso_whatsapp FROM public;
GRANT EXECUTE ON FUNCTION public.registra_consenso_whatsapp TO anon, authenticated;