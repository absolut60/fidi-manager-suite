-- Nuovi campi anagrafica clienti
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS telefono_2 text,
  ADD COLUMN IF NOT EXISTS codice_macrocategoria text,
  ADD COLUMN IF NOT EXISTS macrocategoria text,
  ADD COLUMN IF NOT EXISTS codice_categoria text,
  ADD COLUMN IF NOT EXISTS categoria text;

-- Tabella macrocategorie
CREATE TABLE IF NOT EXISTS public.macrocategorie (
  codice text PRIMARY KEY,
  label  text NOT NULL
);

ALTER TABLE public.macrocategorie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Macrocategorie: tutti autenticati leggono"
  ON public.macrocategorie FOR SELECT TO authenticated USING (true);

CREATE POLICY "Macrocategorie: solo admin modifica"
  ON public.macrocategorie FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));

INSERT INTO public.macrocategorie (codice, label) VALUES
  ('01', 'IMPRESE EDILI'),
  ('02', 'PRIVATI'),
  ('03', 'DIPENDENTI'),
  ('04', 'AZIENDA'),
  ('N/D', 'Altre macrocategorie')
ON CONFLICT (codice) DO UPDATE SET label = EXCLUDED.label;

-- Tabella categorie
CREATE TABLE IF NOT EXISTS public.categorie_cliente (
  codice text PRIMARY KEY,
  label  text NOT NULL
);

ALTER TABLE public.categorie_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorie: tutti autenticati leggono"
  ON public.categorie_cliente FOR SELECT TO authenticated USING (true);

CREATE POLICY "Categorie: solo admin modifica"
  ON public.categorie_cliente FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'amministratore'::app_role))
  WITH CHECK (has_role(auth.uid(), 'amministratore'::app_role));

INSERT INTO public.categorie_cliente (codice, label) VALUES
  ('01', 'IMPRESE Categoria A'),
  ('02', 'IMPRESE Categoria B'),
  ('03', 'IMPRESE Categoria C'),
  ('N/D', 'Altre categorie')
ON CONFLICT (codice) DO UPDATE SET label = EXCLUDED.label;