ALTER TABLE public.eventi_partecipanti ADD COLUMN origine text NOT NULL DEFAULT 'atteso';

ALTER TABLE public.eventi_partecipanti ADD CONSTRAINT eventi_partecipanti_origine_chk CHECK (origine IN ('atteso','sul_posto','import'));

UPDATE public.eventi_partecipanti SET origine = 'sul_posto' WHERE registrato_sul_posto = true;

DROP VIEW IF EXISTS public.v_eventi_partecipanti_stato;

CREATE VIEW public.v_eventi_partecipanti_stato WITH (security_invoker = true) AS
SELECT
  p.id,
  p.evento_id,
  p.stato,
  p.lead_id,
  p.cliente_id,
  p.contatto_id,
  p.nome,
  p.cognome,
  p.ragione_sociale,
  p.partita_iva,
  p.codice_fiscale,
  p.email,
  p.telefono,
  p.note,
  p.created_at,
  p.updated_at,
  p.riconciliato_il,
  p.registrato_sul_posto,
  p.origine,
  (
    p.lead_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lead l
      WHERE l.id = p.lead_id AND l.fonte = 'evento'
    )
    AND NOT EXISTS (SELECT 1 FROM public.opportunita o WHERE o.lead_id = p.lead_id)
    AND NOT EXISTS (SELECT 1 FROM public.attivita_commerciale a WHERE a.lead_id = p.lead_id)
    AND NOT EXISTS (SELECT 1 FROM public.lead_richieste r WHERE r.lead_id = p.lead_id)
    AND NOT EXISTS (SELECT 1 FROM public.cantieri c WHERE c.lead_id = p.lead_id)
  ) AS lead_evento_grezzo
FROM public.eventi_partecipanti p;

GRANT SELECT ON public.v_eventi_partecipanti_stato TO authenticated;
GRANT SELECT ON public.v_eventi_partecipanti_stato TO service_role;