ALTER TABLE public.importazioni ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.eventi(id) ON DELETE SET NULL;

CREATE TABLE public.eventi_import_righe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importazione_id uuid NOT NULL REFERENCES public.importazioni(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.eventi(id) ON DELETE CASCADE,
  riga_numero int,
  nome text,
  cognome text,
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  email text,
  telefono text,
  cellulare text,
  note text,
  match_tipo text CHECK (match_tipo IN ('cliente','lead','contatto','nessuno')),
  match_id uuid,
  match_contatto_id uuid,
  match_criterio text,
  match_privacy_firmata boolean,
  match_alternative jsonb,
  stato text NOT NULL DEFAULT 'in_sospeso' CHECK (stato IN ('in_sospeso','collegato','lead_creato','scartato')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventi_import_righe TO authenticated;
GRANT ALL ON public.eventi_import_righe TO service_role;

ALTER TABLE public.eventi_import_righe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modulo lead gestisce le righe import eventi"
ON public.eventi_import_righe FOR ALL TO authenticated
USING (public.has_lead_module_access(auth.uid()))
WITH CHECK (public.has_lead_module_access(auth.uid()));

CREATE INDEX idx_eventi_import_righe_importazione ON public.eventi_import_righe(importazione_id);
CREATE INDEX idx_eventi_import_righe_evento ON public.eventi_import_righe(evento_id);
CREATE INDEX idx_eventi_import_righe_stato ON public.eventi_import_righe(stato);

CREATE OR REPLACE FUNCTION public.trova_corrispondenze_soggetto(
  _email text DEFAULT NULL,
  _partita_iva text DEFAULT NULL,
  _codice_fiscale text DEFAULT NULL,
  _nome text DEFAULT NULL,
  _cognome text DEFAULT NULL,
  _ragione_sociale text DEFAULT NULL
)
RETURNS TABLE(tipo text, id uuid, contatto_id uuid, etichetta text, criterio text, privacy_firmata boolean, priorita int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH par AS (
  SELECT
    nullif(lower(trim(coalesce(_email,''))),'')          AS email,
    nullif(trim(coalesce(_partita_iva,'')),'')           AS piva,
    nullif(upper(trim(coalesce(_codice_fiscale,''))),'') AS cf,
    nullif(trim(coalesce(_nome,'')),'')                  AS nome,
    nullif(trim(coalesce(_cognome,'')),'')               AS cognome,
    nullif(trim(coalesce(_ragione_sociale,'')),'')       AS rs
),
cand AS (
  -- priorità 1: email
  SELECT 'contatto'::text AS tipo, coalesce(c.cliente_id, c.lead_id) AS id, c.id AS contatto_id,
         nullif(trim(coalesce(c.nome,'') || ' ' || coalesce(c.cognome,'')),'') AS etichetta,
         'email'::text AS criterio, c.privacy_firmata AS privacy_firmata, 1 AS priorita
  FROM public.contatti c, par p
  WHERE p.email IS NOT NULL AND lower(trim(coalesce(c.email,''))) = p.email
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'email', NULL::boolean, 1
  FROM public.clienti cl, par p
  WHERE p.email IS NOT NULL AND lower(trim(coalesce(cl.email,''))) = p.email
  -- priorità 2: partita iva / codice fiscale (esclusi i placeholder)
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'partita_iva', NULL::boolean, 2
  FROM public.clienti cl, par p
  WHERE p.piva IS NOT NULL AND p.piva NOT IN ('102730','102729')
    AND nullif(trim(coalesce(cl.partita_iva,'')),'') = p.piva
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'partita_iva', NULL::boolean, 2
  FROM public.lead l, par p
  WHERE p.piva IS NOT NULL AND p.piva NOT IN ('102730','102729')
    AND nullif(trim(coalesce(l.partita_iva,'')),'') = p.piva
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'codice_fiscale', NULL::boolean, 2
  FROM public.clienti cl, par p
  WHERE p.cf IS NOT NULL AND p.cf NOT IN ('102730','102729')
    AND nullif(upper(trim(coalesce(cl.codice_fiscale,''))),'') = p.cf
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'codice_fiscale', NULL::boolean, 2
  FROM public.lead l, par p
  WHERE p.cf IS NOT NULL AND p.cf NOT IN ('102730','102729')
    AND nullif(upper(trim(coalesce(l.codice_fiscale,''))),'') = p.cf
  -- priorità 3: nome / ragione sociale
  UNION ALL
  SELECT 'cliente', cl.id, NULL::uuid, cl.ragione_sociale, 'nome', NULL::boolean, 3
  FROM public.clienti cl, par p
  WHERE p.rs IS NOT NULL AND lower(trim(coalesce(cl.ragione_sociale,''))) = lower(p.rs)
  UNION ALL
  SELECT 'lead', l.id, NULL::uuid, l.ragione_sociale, 'nome', NULL::boolean, 3
  FROM public.lead l, par p
  WHERE p.rs IS NOT NULL AND lower(trim(coalesce(l.ragione_sociale,''))) = lower(p.rs)
  UNION ALL
  SELECT 'contatto', coalesce(c.cliente_id, c.lead_id), c.id,
         nullif(trim(coalesce(c.nome,'') || ' ' || coalesce(c.cognome,'')),''),
         'nome', c.privacy_firmata, 3
  FROM public.contatti c, par p
  WHERE p.nome IS NOT NULL AND p.cognome IS NOT NULL
    AND lower(trim(coalesce(c.nome,''))) = lower(p.nome)
    AND lower(trim(coalesce(c.cognome,''))) = lower(p.cognome)
),
uniq AS (
  SELECT DISTINCT ON (tipo, coalesce(contatto_id, id)) *
  FROM cand
  ORDER BY tipo, coalesce(contatto_id, id), priorita
)
SELECT u.tipo,
       u.id,
       coalesce(u.contatto_id, ct.id) AS contatto_id,
       u.etichetta,
       u.criterio,
       coalesce(u.privacy_firmata, ct.privacy_firmata, false) AS privacy_firmata,
       u.priorita
FROM uniq u
LEFT JOIN LATERAL (
  SELECT k.id, k.privacy_firmata
  FROM public.contatti k
  WHERE u.contatto_id IS NULL AND u.id IS NOT NULL
    AND (k.cliente_id = u.id OR k.lead_id = u.id)
  ORDER BY k.privacy_firmata DESC, k.principale DESC
  LIMIT 1
) ct ON TRUE
ORDER BY u.priorita, u.tipo, u.etichetta
$$;

REVOKE ALL ON FUNCTION public.trova_corrispondenze_soggetto(text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trova_corrispondenze_soggetto(text,text,text,text,text,text) TO authenticated, service_role;