ALTER TABLE public.preventivi
  ADD COLUMN lead_id uuid NULL REFERENCES public.lead(id),
  ADD COLUMN lead_origine_id uuid NULL REFERENCES public.lead(id),
  ADD CONSTRAINT preventivi_cliente_lead_alternativi CHECK (cliente_id IS NULL OR lead_id IS NULL);
CREATE INDEX idx_preventivi_lead_id ON public.preventivi(lead_id);
COMMENT ON COLUMN public.preventivi.lead_id IS 'FM71: lead destinatario del preventivo, alternativo al cliente.';
COMMENT ON COLUMN public.preventivi.lead_origine_id IS 'FM71: provenienza dal lead dopo il riaggancio automatico al cliente.';

ALTER TABLE public.lead
  ADD COLUMN condizione_pagamento_cod text NULL,
  ADD COLUMN listino_rif smallint NULL REFERENCES public.listini_gamma(codice),
  ADD COLUMN macrocategoria_rif text NULL,
  ADD COLUMN categoria_rif text NULL;
COMMENT ON COLUMN public.lead.condizione_pagamento_cod IS 'FM71: condizione di pagamento proposta al preventivo, codice del catalogo codici_pagamento, senza FK come sul preventivo.';
COMMENT ON COLUMN public.lead.listino_rif IS 'FM71: listino delle condizioni di riferimento proposte al preventivo.';
COMMENT ON COLUMN public.lead.macrocategoria_rif IS 'FM71: macrocategoria delle condizioni di riferimento proposte al preventivo.';
COMMENT ON COLUMN public.lead.categoria_rif IS 'FM71: categoria delle condizioni di riferimento proposte al preventivo.';

CREATE FUNCTION public.lead_riaggancia_preventivi_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.cliente_id IS NULL AND NEW.cliente_id IS NOT NULL THEN
    UPDATE public.preventivi
    SET cliente_id = NEW.cliente_id, lead_origine_id = lead_id, lead_id = NULL
    WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.lead_riaggancia_preventivi_cliente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_riaggancia_preventivi_cliente() TO service_role;
CREATE TRIGGER trg_lead_riaggancia_preventivi_cliente
AFTER UPDATE OF cliente_id ON public.lead
FOR EACH ROW EXECUTE FUNCTION public.lead_riaggancia_preventivi_cliente();

-- Creare la nuova firma prima di aggiornare le dipendenze: niente CASCADE.
CREATE FUNCTION public.auth_vede_preventivo(_agente_codice text, _cliente_id uuid, _cantiere_id uuid, _lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.auth_consulta_preventivi()
     AND ( NOT ( has_role(auth.uid(),'agente'::app_role)
                 AND NOT has_role(auth.uid(),'amministratore'::app_role)
                 AND NOT has_role(auth.uid(),'preventivi_manage'::app_role) )
           OR public.agente_vede_record(_agente_codice, NULL, _cliente_id, _lead_id, _cantiere_id) );
$function$;
REVOKE EXECUTE ON FUNCTION public.auth_vede_preventivo(text,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_vede_preventivo(text,uuid,uuid,uuid) TO authenticated, service_role;
ALTER POLICY preventivi_select ON public.preventivi
USING (public.auth_vede_preventivo(agente_codice, cliente_id, cantiere_id, lead_id));

-- Sei lettori esistenti: sostituire solo l'argomento del gate, preservando corpo,
-- firma, attributi e privilegi; tutti gli altri predicati restano identici.
DO $migration$
DECLARE f record; definizione text; aggiornata text;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS firma
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('auth_vede_preventivo_id','get_cliente_lite','get_clienti_lite_by_ids',
                       'get_clienti_elenco_preventivi','dati_cliente_preventivo','indicatore_cliente_preventivo')
  LOOP
    definizione := pg_get_functiondef(f.oid);
    aggiornata := replace(replace(definizione,
      'public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id)',
      'public.auth_vede_preventivo(p.agente_codice, p.cliente_id, p.cantiere_id, p.lead_id)'),
      'public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id)',
      'public.auth_vede_preventivo(p.agente_codice,p.cliente_id,p.cantiere_id,p.lead_id)');
    IF aggiornata = definizione THEN
      RAISE EXCEPTION 'FM71: dipendenza non aggiornata: %', f.firma;
    END IF;
    EXECUTE aggiornata;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.firma);
  END LOOP;
END;
$migration$;
DROP FUNCTION public.auth_vede_preventivo(text,uuid,uuid);
