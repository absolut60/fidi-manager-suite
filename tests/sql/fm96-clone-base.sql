-- SOLO database di prova vuoto: fotografia delle colonne reali del 22/11/2026.
-- Senza dati reali e FK operative; auth_vede_preventivo_id usa una matrice di test.
-- auth_mfa_ok, has_role, auth_listini_sede e riaggancio sono le definizioni reali.
-- Preparare i ruoli authenticated, anon, service_role nel cluster locale prima di eseguire.
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$; CREATE TABLE auth.mfa_factors(user_id uuid,status text); CREATE TABLE storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon, service_role; GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
CREATE TYPE public.app_role AS ENUM ('store_manager','approvatore_liv1','approvatore_liv2','approvatore_liv3','amministratore','amministrazione','direzione','agente','richiedente','approvatore_richieste_liv1','approvatore_richieste_liv2','gestore_richieste','esecutore_richieste','marketing','preventivi_read','preventivi_write','preventivi_manage','responsabile_agenti','marketing_eventi','amministrazione_strumenti','recupero_crediti','tesoreria','showroom','responsabile_showroom');
CREATE TYPE public.categoria_allegato AS ENUM ('capitolato','disegni','scheda_tecnica','certificazioni','foto_cantiere','documenti_commerciali','altro');
CREATE TYPE public.categoria_allegato_articolo AS ENUM ('scheda_tecnica','scheda_sicurezza','certificazione_ce_dop','certificazione_antincendio','certificazione_acustica','dichiarazione_conformita','voce_capitolato','manuale_posa','certificato_ambientale','immagine_prodotto','disegno_tecnico','altro');
CREATE TYPE public.esito_approvazione AS ENUM ('approvata','rifiutata');
CREATE TYPE public.eventi_partecipante_stato AS ENUM ('atteso','confermato','presentato','no_show');
CREATE TYPE public.fascia_listino AS ENUM ('A','B','C','SOCI');
CREATE TYPE public.lead_fonte AS ENUM ('web','hubspot','manuale','fiera','evento','altro');
CREATE TYPE public.lead_priorita AS ENUM ('alta','media','bassa');
CREATE TYPE public.lead_richiesta_stato AS ENUM ('aperta','in_lavorazione','evasa','respinta');
CREATE TYPE public.lead_richiesta_tipo AS ENUM ('preventivo','ristrutturazione','info_tecnica','info_commerciale');
CREATE TYPE public.lead_stato AS ENUM ('nuovo','assegnato','in_lavorazione','qualificato','convertito','perso');
CREATE TYPE public.lead_tipo AS ENUM ('potenziale_cliente','richiesta_specifica');
CREATE TYPE public.leva_prezzo_showroom AS ENUM ('ricarico','sconto_listino','prezzo_manuale');
CREATE TYPE public.linea_preventivo AS ENUM ('sistema_made','showroom','edilizia','fotovoltaico');
CREATE TYPE public.regime_iva_preventivo AS ENUM ('ordinaria','agevolata_10','agevolata_10_bs');
CREATE TYPE public.stato_articolo AS ENUM ('attivo','potenziale');
CREATE TYPE public.stato_importazione AS ENUM ('in_elaborazione','completata','completata_con_errori','fallita');
CREATE TYPE public.stato_messaggio_wa AS ENUM ('in_coda','inviato','consegnato','letto','fallito');
CREATE TYPE public.stato_opportunita AS ENUM ('aperta','in_lavorazione','preventivo','vinta','persa');
CREATE TYPE public.stato_polizza AS ENUM ('attiva','sospesa','scaduta','sinistro_aperto','sinistro_chiuso');
CREATE TYPE public.stato_pratica_legale AS ENUM ('aperta','in_corso','decreto_ottenuto','pignoramento_eseguito','pignoramento_negativo','chiusa_pagamento','chiusa_perdita','sospesa');
CREATE TYPE public.stato_preventivo AS ENUM ('bozza','inviato','confermato','ordinato');
CREATE TYPE public.stato_richiesta AS ENUM ('bozza','in_approvazione','approvata','rifiutata','annullata','in_attesa_liv1','in_attesa_liv2','in_attesa_liv3','integrazioni_richieste');
CREATE TYPE public.stato_sollecito AS ENUM ('inviato','in_attesa_risposta','risposto','ignorato','risolto');
CREATE TYPE public.stato_task AS ENUM ('da_fare','in_corso','fatto','annullato');
CREATE TYPE public.tipo_area AS ENUM ('recupero_crediti','commerciale','amministrazione','magazzino');
CREATE TYPE public.tipo_attivita_commerciale AS ENUM ('appuntamento','visita','chiamata','email','preventivo_inviato','nota','altro');
CREATE TYPE public.tipo_canale AS ENUM ('area','store','diretto','task');
CREATE TYPE public.tipo_doc_preventivo AS ENUM ('PREVENTIVO','PROPOSTA_RAPIDA','LISTA_MATERIALI','LISTA_MAT_FORNITORE');
CREATE TYPE public.tipo_documento AS ENUM ('preventivo','ordine');
CREATE TYPE public.tipo_opportunita AS ENUM ('vendita','fornitura','preventivo','altro');
CREATE TYPE public.tipo_pratica_legale AS ENUM ('decreto_ingiuntivo','pignoramento','precetto','azione_legale_generica','messa_a_perdita','concordato','fallimento','altro');
CREATE TYPE public.tipo_reminder AS ENUM ('scadenza_insoluto','sollecito_programmato','revisione_pratica_legale','rinnovo_assicurazione','custom');
CREATE TYPE public.tipo_richiesta AS ENUM ('nuovo','aumento','diminuzione','rinnovo','nuovo_fido');
CREATE TYPE public.tipo_riga_preventivo AS ENUM ('da_kit','articolo_singolo','manuale','sotto_totale','nota','separatore');
CREATE TYPE public.tipo_sollecito AS ENUM ('interno','email','telefono','raccomandata','avvocato','legale','altro');
CREATE TYPE public.tipo_variazione_fido AS ENUM ('nuovo','aumento','diminuzione','rinnovo','sospensione','revoca');
CREATE TABLE public.articoli_gamma_listini("articolo_codice" text,"listino" int2,"prezzo_vendita" numeric,"costo_acquisto" numeric,"acq_prezzo" numeric,"acq_sc1" numeric,"acq_sc2" numeric,"acq_sc3" numeric,"acq_trasporto_perc" numeric,"acq_trasporto_euro" numeric);
CREATE TABLE public.blocchi_preventivo("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"preventivo_id" uuid,"descrizione" text,"rif_capitolato" text,"note_tecniche" text,"ordine" int4 DEFAULT 0,"kit_id" uuid,"um_base" text,"quantita_base" numeric,"prezzo_um" numeric,"importo" numeric,"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now());
CREATE TABLE public.lead("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"ragione_sociale" text,"nome" text,"cognome" text,"tipo_soggetto" text,"partita_iva" text,"codice_fiscale" text,"email" text,"telefono" text,"cellulare" text,"indirizzo" text,"citta" text,"cap" text,"provincia" text,"fonte" public.lead_fonte DEFAULT 'manuale'::lead_fonte,"fonte_dettaglio" text,"hubspot_id" text,"stato" public.lead_stato DEFAULT 'nuovo'::lead_stato,"tipo_lead" public.lead_tipo DEFAULT 'potenziale_cliente'::lead_tipo,"priorita" public.lead_priorita DEFAULT 'media'::lead_priorita,"store_id" uuid,"agente_codice" text,"assegnato_a" uuid,"assegnato_il" timestamptz,"prossima_azione_il" date,"prossima_azione_nota" text,"prossima_azione_tipo" text,"cliente_id" uuid,"convertito_il" timestamptz,"convertito_da" uuid,"motivo_perdita" text,"note" text,"created_by" uuid DEFAULT auth.uid(),"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now(),"mestiere_id" uuid,"ambito" text DEFAULT 'commerciale'::text,"conversione_tipo" text,"condizione_pagamento_cod" text,"listino_rif" int2,"macrocategoria_rif" text,"categoria_rif" text,"codice_sdi" text);
CREATE TABLE public.preventivi("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"tipo" public.tipo_documento DEFAULT 'preventivo'::tipo_documento,"numero" text,"data" date DEFAULT CURRENT_DATE,"validita" date,"cliente_id" uuid,"agente_codice" text,"cantiere_id" uuid,"filiale" text,"fascia_listino" public.fascia_listino,"stato" public.stato_preventivo DEFAULT 'bozza'::stato_preventivo,"tipo_doc" public.tipo_doc_preventivo DEFAULT 'PREVENTIVO'::tipo_doc_preventivo,"iva_perc" numeric DEFAULT 22,"iva_importo" numeric,"sconto_piede_perc" numeric DEFAULT 0,"totale_imponibile" numeric,"totale" numeric,"note" text,"preventivo_origine_id" uuid,"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now(),"cantiere_descrizione" text,"titolo" text,"alternativa_di" uuid,"creato_da" uuid DEFAULT auth.uid(),"condizione_pagamento_cod" text,"store_id" uuid,"listino_rif" int2,"macrocategoria_rif" text,"categoria_rif" text,"lead_id" uuid,"lead_origine_id" uuid,"assegnato_a" uuid,"assegnati_copia" uuid[] DEFAULT '{}'::uuid[],"linea" public.linea_preventivo DEFAULT 'sistema_made'::linea_preventivo,"regime_iva" public.regime_iva_preventivo DEFAULT 'ordinaria'::regime_iva_preventivo,"chiuso_at" timestamptz,"chiuso_da" uuid,"stato_prima_ordine" public.stato_preventivo,"data_consegna" date);
CREATE TABLE public.profili("id" uuid PRIMARY KEY,"nome" text,"cognome" text,"email" text,"store_id" uuid,"attivo" bool DEFAULT true,"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now(),"codice_agente" text,"deve_cambiare_password" bool DEFAULT false,"password_cambiata_il" timestamptz,"linee_abilitate" public.linea_preventivo[] DEFAULT '{sistema_made}'::linea_preventivo[],"linea_predefinita" public.linea_preventivo DEFAULT 'sistema_made'::linea_preventivo);
CREATE TABLE public.righe_preventivo("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"blocco_id" uuid,"tipo_riga" public.tipo_riga_preventivo DEFAULT 'manuale'::tipo_riga_preventivo,"articolo_id" uuid,"descrizione" text,"um" text,"incidenza" numeric,"quantita" numeric,"qta_ordinata" numeric DEFAULT 0,"prezzo_unit" numeric,"sconto_perc" numeric,"segno" int4 DEFAULT 1,"importo" numeric,"costo" numeric,"ricarico" numeric,"margine" numeric,"vendita" numeric,"peso" numeric,"ordine" int4 DEFAULT 0,"riga_origine_id" uuid,"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now(),"articolo_codice" text,"sconti_gamma" numeric[] DEFAULT '{}'::numeric[],"maggiorazione_perc" numeric DEFAULT 0,"um_scelta" text DEFAULT 'um1'::text,"fonte_prezzo" text,"stampabile" bool DEFAULT true,"bene_significativo" bool DEFAULT false,"aliquota_iva" numeric,"fornitore_id" uuid,"marca" text,"codice_articolo_fornitore" text,"listino_fornitore" numeric,"leva_prezzo" public.leva_prezzo_showroom,"ruolo_kit" text,"codice_famiglia" text,"codice_sottofamiglia" text,"um2" text,"fattore_conversione" numeric);
CREATE TABLE public.stores("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"codice" text,"nome" text,"citta" text,"indirizzo" text,"telefono" text,"attivo" bool DEFAULT true,"created_at" timestamptz DEFAULT now(),"updated_at" timestamptz DEFAULT now(),"cap" text,"provincia" text,"email_sede" text,"pec_sede" text,"piva" text,"ragione_sociale_sede" text,"insegna" text,"lat" float8,"lng" float8,"geocodifica_stato" text DEFAULT 'da_geocodificare'::text,"geocodificato_il" timestamptz,"listino_riferimento" int2,"logo_email_path" text,"logo_pdf_path" text);
CREATE TABLE public.user_roles("id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,"user_id" uuid,"role" public.app_role,"created_at" timestamptz DEFAULT now());
ALTER TABLE public.preventivi ADD CHECK(cliente_id IS NULL OR lead_id IS NULL);


CREATE OR REPLACE FUNCTION public.auth_mfa_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN true
    WHEN coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' THEN true
    ELSE NOT EXISTS (
           SELECT 1 FROM auth.mfa_factors f
           WHERE f.user_id = auth.uid() AND f.status = 'verified'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid() AND ur.role = 'amministratore'
         )
  END
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    ) THEN false
    WHEN _role <> 'amministratore' OR _user_id IS DISTINCT FROM auth.uid() THEN true
    ELSE public.auth_mfa_ok()
  END
$function$;

CREATE OR REPLACE FUNCTION public.lead_riaggancia_preventivi_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.profilo_store_id_corrente()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.store_id FROM public.profili p WHERE p.id = auth.uid() LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.ricalcola_qta_ordinata_origine()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new uuid;
  v_old uuid;
  v_id uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN v_new := NEW.riga_origine_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD.riga_origine_id; END IF;
  FOR v_id IN SELECT DISTINCT id FROM (VALUES (v_new), (v_old)) AS origini(id) WHERE id IS NOT NULL ORDER BY id
  LOOP
    UPDATE public.righe_preventivo SET qta_ordinata = COALESCE((SELECT SUM(COALESCE(o.quantita, 0)) FROM public.righe_preventivo o WHERE o.riga_origine_id = v_id), 0) WHERE id = v_id;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auth_listini_sede()
 RETURNS TABLE(globale boolean, store_id uuid, listino smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (public.has_role(auth.uid(), 'amministratore') OR p.sid IS NULL OR s.listino_riferimento IS NULL) AS globale,
         p.sid, s.listino_riferimento
  FROM (SELECT public.profilo_store_id_corrente() AS sid) p
  LEFT JOIN public.stores s ON s.id = p.sid
$function$;
CREATE TABLE public.fm96_visibility(ordine_id uuid,utente uuid); CREATE FUNCTION public.auth_vede_preventivo_id(_preventivo_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM fm96_visibility WHERE ordine_id=_preventivo_id AND utente=auth.uid()) $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; CREATE TRIGGER trg_lead_riaggancia_preventivi_cliente AFTER UPDATE OF cliente_id ON public.lead FOR EACH ROW EXECUTE FUNCTION public.lead_riaggancia_preventivi_cliente(); CREATE TRIGGER trg_ricalcola_qta_ordinata AFTER INSERT OR DELETE OR UPDATE OF quantita,riga_origine_id ON public.righe_preventivo FOR EACH ROW EXECUTE FUNCTION public.ricalcola_qta_ordinata_origine();
