
CREATE TABLE public.template_lettera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'libero',
  oggetto text,
  corpo text NOT NULL,
  usa_dati_automatici boolean NOT NULL DEFAULT true,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_lettera_tipo_check CHECK (tipo IN ('sollecito_cartaceo','messa_in_mora_cartacea','comunicazione','libero'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_lettera TO authenticated;
GRANT ALL ON public.template_lettera TO service_role;

ALTER TABLE public.template_lettera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura template lettera a tutti gli autenticati" ON public.template_lettera
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo Admin/Direzione/Amm inseriscono template lettera" ON public.template_lettera
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role));

CREATE POLICY "Solo Admin/Direzione/Amm aggiornano template lettera" ON public.template_lettera
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role))
  WITH CHECK (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role));

CREATE POLICY "Solo Admin/Direzione/Amm eliminano template lettera" ON public.template_lettera
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'amministratore'::app_role) OR has_role(auth.uid(),'direzione'::app_role) OR has_role(auth.uid(),'amministrazione'::app_role));

CREATE TRIGGER trg_template_lettera_updated_at
  BEFORE UPDATE ON public.template_lettera
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- SEED: 3 modelli iniziali
INSERT INTO public.template_lettera (nome, tipo, oggetto, corpo, usa_dati_automatici, attivo) VALUES
(
  'Sollecito di pagamento (cartaceo)',
  'sollecito_cartaceo',
  'Oggetto: sollecito di pagamento',
  E'Spett.le {{ragione_sociale}}\n{{indirizzo_cliente}}\n{{cap_citta_cliente}}\n\n{{luogo_data}}\n\nOggetto: sollecito di pagamento\n\nEgregi Signori,\n\ndall''esame della Vostra posizione contabile risulta a Vostro carico un importo scaduto e non ancora saldato pari a {{totale_scaduto}}, riferito alle scadenze di seguito elencate:\n\n{{elenco_scadenze}}\n\nVi invitiamo pertanto a provvedere con cortese sollecitudine al pagamento di quanto dovuto entro 7 giorni dal ricevimento della presente.\n\nQualora il pagamento sia gia stato effettuato, Vi preghiamo di considerare nulla la presente comunicazione e di trasmetterci copia della contabile per gli opportuni riscontri.\n\nRestando a disposizione per ogni chiarimento, porgiamo distinti saluti.\n\n{{insegna_sede}}\n{{nome_operatore}}',
  true, true
),
(
  'Messa in mora (cartacea)',
  'messa_in_mora_cartacea',
  'Oggetto: diffida ad adempiere e costituzione in mora',
  E'RACCOMANDATA A.R. / PEC\n\nSpett.le {{ragione_sociale}}\n{{indirizzo_cliente}}\n{{cap_citta_cliente}}\n\n{{luogo_data}}\n\nOggetto: diffida ad adempiere e costituzione in mora ex art. 1219 c.c.\n\nEgregi Signori,\n\nnonostante i precedenti solleciti, risulta tuttora insoluto a Vostro carico l''importo complessivo di {{totale_scaduto}}, relativo alle seguenti fatture/scadenze gia scadute:\n\n{{elenco_scadenze}}\n\nCon la presente, ai sensi e per gli effetti dell''art. 1219 c.c., Vi costituiamo formalmente in mora e Vi diffidiamo ad adempiere al pagamento integrale di quanto dovuto entro e non oltre 15 (quindici) giorni dal ricevimento della presente.\n\nIn difetto, ci vedremo costretti — senza ulteriore preavviso — a trasmettere la pratica al nostro Ufficio Legale per il recupero coattivo del credito, con addebito di interessi di mora ex D.Lgs. 231/2002, spese di recupero ed ogni altro onere accessorio.\n\nLa presente vale altresi quale formale atto interruttivo della prescrizione ai sensi degli artt. 2943 e 2945 c.c.\n\nDistinti saluti.\n\n{{insegna_sede}}\n{{nome_operatore}}',
  true, true
),
(
  'Comunicazione libera',
  'libero',
  'Oggetto: comunicazione',
  E'Spett.le {{ragione_sociale}}\n{{indirizzo_cliente}}\n{{cap_citta_cliente}}\n\n{{luogo_data}}\n\nOggetto: \n\nEgregi Signori,\n\n[testo della comunicazione]\n\nCordiali saluti.\n\n{{insegna_sede}}\n{{nome_operatore}}',
  false, true
);
