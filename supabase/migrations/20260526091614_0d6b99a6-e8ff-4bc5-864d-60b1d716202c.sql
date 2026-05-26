CREATE TABLE IF NOT EXISTS public.codici_pagamento (
  cod text PRIMARY KEY,
  descrizione text NOT NULL
);

ALTER TABLE public.codici_pagamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Codici pagamento: tutti autenticati leggono" ON public.codici_pagamento;
CREATE POLICY "Codici pagamento: tutti autenticati leggono"
  ON public.codici_pagamento FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Codici pagamento: solo admin modifica" ON public.codici_pagamento;
CREATE POLICY "Codici pagamento: solo admin modifica"
  ON public.codici_pagamento FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));

INSERT INTO public.codici_pagamento (cod, descrizione) VALUES
  ('S01','Rimessa diretta POS'),
  ('BO02','Bonifico 60 gg. d.f. f.m.'),
  ('BO18','Bonifico 30/60 gg. d.f.'),
  ('RB23','R.B. 90 gg. d.f. f.m.'),
  ('RD01','Rimessa diretta vista fattura contanti'),
  ('S10','Rimessa diretta contanti CASOREZZO'),
  ('BO05','Bonifico 30 gg. d.f. f.m.'),
  ('RB22','R.B. 60 gg. d.f. f.m.'),
  ('RB21','R.B. 30 gg. d.f. f.m.'),
  ('BO10','Bonifico bancario vista fattura'),
  ('RB09','R.B. 60 gg. d.f. f.m. 10 ms'),
  ('RB26','R.B. 60/90 gg. d.f. f.m.'),
  ('RB12','R.B. 90 gg. d.f. f.m. 10 ms'),
  ('RB25','R.B. 30/60 gg. d.f. f.m.'),
  ('RB05','R.B. 60 gg d.f. 10 ms'),
  ('BOS','Bonifico bancario vista fattura S'),
  ('S11','Rimessa diretta contanti LISSONE'),
  ('BO04','Bonifico 60 gg. d.f. f.m. 10 ms'),
  ('RB29','R.B. 60/90/120 gg. d.f. f.m.'),
  ('RB11','R.B. 90 gg. d.f. 5 ms'),
  ('RB38','R.B. 60/90 gg. d.f. 10 ms'),
  ('RB69','R.B. 30 gg. d.f. f.m. 10 ms'),
  ('S14','Rimessa diretta contanti AFFORI'),
  ('BO03','Bonifico 90 gg. d.f. f.m.'),
  ('BO06','Bonifico 150 gg. d.f. f.m.'),
  ('RB28','R.B. 30/60/90 gg. d.f. f.m.'),
  ('S12','Rimessa diretta contanti CAMBIAGO'),
  ('RD02','Rimessa diretta vista fattura assegno'),
  ('RB01','R.B. 30 gg. d.f. 10 ms'),
  ('RB10','R.B. 60 gg. d.f. f.m. 15 ms'),
  ('RB86','R.B. 30/60/90 gg. d.f. 10 ms'),
  ('BO07','Bonifico 90 gg. d.f. f.m. 10 ms'),
  ('RB37','R.B. 60/90 gg. d.f. f.m. 10 ms'),
  ('BO09','Bonifico 60 gg. d.f. f.m. 15 ms'),
  ('RB27','R.B. 90/120 gg. d.f. f.m.'),
  ('RB15','R.B. 120 gg. d.f. f.m. 10 ms'),
  ('RB24','R.B. 120 gg. d.f. f.m.'),
  ('RB02','R.B. 60 gg. d.f.'),
  ('S13','Rimessa diretta contanti PIANEZZA'),
  ('AV56','Rimessa diretta vista fattura ***'),
  ('S51','Rimessa diretta assegno LISSONE'),
  ('S02','Bonifico'),
  ('S50','Rimessa diretta assegno CASOREZZO'),
  ('RD03','Rimessa diretta da finanziaria'),
  ('O01','ON-LINE carta di credito'),
  ('BO13','Bonifico 30/60 gg. d.f. f.m.'),
  ('S52','Rimessa diretta assegno CAMBIAGO'),
  ('BO11','Bonifico 30 gg. d.f. f.m. 10 ms'),
  ('RB13','R.B. 120 gg. d.f. 5 ms'),
  ('RB41','R.B. 30/60 gg. d.f. 10ms'),
  ('S53','Rimessa diretta assegno PIANEZZA'),
  ('BO15','Bonifico 90/120 gg. d.f. f.m.'),
  ('RB30','R.B. 90/120/150 gg. d.f. f.m.'),
  ('BO14','Bonifico 120 gg. d.f. f.m.'),
  ('BO17','Bonifico 60/90/120 gg. d.f. f.m.'),
  ('RID04','RID vista fattura'),
  ('RID07','RID 60 gg. d.f.'),
  ('S15','Rimessa diretta contanti CERIANO'),
  ('RB19','R.B. 90/120 gg. d.f. f.m. 10 ms'),
  ('S16','Rimessa diretta contanti VERCELLI'),
  ('RB32','R.B. 30/60/90/120 gg. d.f. f.m.'),
  ('BO12','Bonifico 30/60/90 gg. d.f. f.m.'),
  ('S17','Rimessa diretta contanti CINISELLO'),
  ('S18','Rimessa diretta contanti SAVIGLIANO'),
  ('BO08','Bonifico 60/90 gg. d.f. f.m.'),
  ('RB35','R.B. 60 gg. d.f. f.m. 5 ms'),
  ('S56','Rimessa diretta assegno VERCELLI'),
  ('S58','Rimessa diretta assegno SAVIGLIANO'),
  ('RB06','R.B. 60/90 gg. d.f.'),
  ('RB03','R.B. 90 gg. d.f.'),
  ('BO21','Bonifico 60/90 gg d.f. f.m. al 15 ms'),
  ('RB84','R.B. 60/90 gg d.f. f.m. al 15 ms'),
  ('RB64','R.B. 90 gg d.f. f.m. 15ms'),
  ('BO22','Bonifico 30/60 gg. d.f.+15'),
  ('RB73','R.B. 90 gg. d.f. 10 ms')
ON CONFLICT (cod) DO UPDATE SET descrizione = EXCLUDED.descrizione;

ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS condizione_pagamento_cod text,
  ADD COLUMN IF NOT EXISTS condizione_pagamento_desc text;