ALTER TABLE public.kit_componenti
 ADD COLUMN n_pezzi numeric,
 ADD COLUMN passo numeric,
 ADD COLUMN passo_2 numeric,
 ADD COLUMN consumo numeric,
 ADD COLUMN lati numeric,
 ADD COLUMN confezione numeric,
 ADD COLUMN sfrido numeric,
 ADD COLUMN peso_unitario numeric,
 ADD COLUMN riga_rif integer,
 ADD CONSTRAINT kit_componenti_passo_positivo CHECK (passo IS NULL OR passo > 0),
 ADD CONSTRAINT kit_componenti_passo_2_positivo CHECK (passo_2 IS NULL OR passo_2 > 0),
 ADD CONSTRAINT kit_componenti_confezione_positiva CHECK (confezione IS NULL OR confezione > 0),
 ADD CONSTRAINT kit_componenti_n_pezzi_non_negativo CHECK (n_pezzi IS NULL OR n_pezzi >= 0),
 ADD CONSTRAINT kit_componenti_consumo_non_negativo CHECK (consumo IS NULL OR consumo >= 0),
 ADD CONSTRAINT kit_componenti_lati_non_negativo CHECK (lati IS NULL OR lati >= 0),
 ADD CONSTRAINT kit_componenti_peso_unitario_non_negativo CHECK (peso_unitario IS NULL OR peso_unitario >= 0),
 ADD CONSTRAINT kit_componenti_riga_rif_valida CHECK (riga_rif IS NULL OR riga_rif >= 1);
COMMENT ON COLUMN public.kit_componenti.riga_rif IS 'Ordine di un altra riga dello stesso kit; riferimenti e cicli validati dal motore kit-regole, senza FK.';
COMMENT ON COLUMN public.kit_componenti.confezione IS 'Divisore manuale solo quando UM primaria Gamma e gia una confezione; mai dedotto dal catalogo.';