-- FM45 P1: promessa di pagamento come tipo proprio (forma transitoria tipo/esito).
CREATE OR REPLACE FUNCTION public.is_promessa_pagamento(_tipo text, _esito text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT coalesce(_tipo,'') = 'promessa_pagamento' OR coalesce(_esito,'') = 'promessa_pagamento' $$;
COMMENT ON FUNCTION public.is_promessa_pagamento(text, text) IS 'Fonte unica: l''azione di recupero è una promessa di pagamento (forma transitoria tipo/esito; in P4 solo tipo).';
REVOKE ALL ON FUNCTION public.is_promessa_pagamento(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_promessa_pagamento(text, text) TO authenticated, service_role;

ALTER TABLE public.azioni_recupero DROP CONSTRAINT azioni_recupero_tipo_check;
ALTER TABLE public.azioni_recupero ADD CONSTRAINT azioni_recupero_tipo_check CHECK (tipo = ANY (ARRAY['email','telefonata','promemoria','nota','lettera','promemoria_scadenza','sinistro_assicurazione','promessa_pagamento']::text[]));

-- Ricrea le funzioni sostituendo SOLO il predicato della promessa (stessa firma/attributi; CREATE OR REPLACE conserva i permessi).
DO $do$
DECLARE
  r record; v_def text; v_new text;
  subs text[][] := ARRAY[
    ['get_recupero_clienti_aggregato', 'az.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(az.tipo, az.esito)'],
    ['get_scadenziario_lista_paginata', 'a.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(a.tipo, a.esito)'],
    ['get_sinistri_da_aprire', 'ar.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(ar.tipo, ar.esito)'],
    ['trg_azioni_recupero_stato_promessa', 'NEW.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(NEW.tipo, NEW.esito)'],
    ['genera_snapshot', 'WHERE esito=''promessa_pagamento''', 'WHERE public.is_promessa_pagamento(tipo, esito)'],
    ['coperture_scadenziario', 'a.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(a.tipo, a.esito)'],
    ['promesse_attive_importo_efficace', 'a.esito = ''promessa_pagamento''', 'public.is_promessa_pagamento(a.tipo, a.esito)'],
    ['notifica_nota_recupero',
     'v_messaggio := CASE WHEN v_testo IS NULL THEN',
     'v_messaggio := CASE WHEN NEW.tipo = ''promessa_pagamento'' THEN CASE WHEN v_testo IS NULL THEN v_autore || '' ha registrato una nuova promessa di pagamento'' ELSE ''Nuova promessa di pagamento — '' || v_autore || '': '' || left(v_testo, 140) END
                        WHEN v_testo IS NULL THEN']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(subs,1) LOOP
    SELECT count(*) INTO STRICT r FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=subs[i][1];
    SELECT pg_get_functiondef(p.oid) INTO STRICT v_def FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=subs[i][1];
    IF position(subs[i][2] IN v_def) = 0 THEN RAISE EXCEPTION 'Predicato non trovato in %', subs[i][1]; END IF;
    v_new := replace(v_def, subs[i][2], subs[i][3]);
    IF v_new ~ 'esito ?= ?''promessa_pagamento''' THEN RAISE EXCEPTION 'Predicato residuo in %', subs[i][1]; END IF;
    EXECUTE v_new;
  END LOOP;
END
$do$;

DROP TRIGGER trg_notifica_nota_recupero ON public.azioni_recupero;
CREATE TRIGGER trg_notifica_nota_recupero AFTER INSERT ON public.azioni_recupero FOR EACH ROW WHEN (new.tipo IN ('nota','promessa_pagamento')) EXECUTE FUNCTION public.notifica_nota_recupero();

ALTER POLICY "Store manager e agente inseriscono azioni sui propri clienti" ON public.azioni_recupero TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM clienti c
  WHERE ((c.id = azioni_recupero.cliente_id) AND (((c.store_id IS NOT NULL) AND (c.store_id = ( SELECT profilo_store_id_corrente() AS profilo_store_id_corrente))) OR ((c.codice_agente IS NOT NULL) AND (c.codice_agente = ( SELECT agente_codice_corrente() AS agente_codice_corrente))))))) AND ((NOT ( SELECT has_role(( SELECT auth.uid() AS uid), 'agente'::app_role) AS has_role)) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'amministratore'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'amministrazione'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'direzione'::app_role) AS has_role) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'recupero_crediti'::app_role) AS has_role) OR ((tipo = ANY (ARRAY['nota'::text, 'promemoria'::text, 'telefonata'::text, 'promessa_pagamento'::text])) AND (COALESCE(esito, ''::text) <> 'piano_rientro'::text))));