-- Indice unico parziale su articoli.cod_gamma (chiave upsert import GAMMA)
-- Allinea il repo all'indice già presente nel database live.
CREATE UNIQUE INDEX IF NOT EXISTS articoli_cod_gamma_unique
  ON public.articoli USING btree (cod_gamma)
  WHERE (cod_gamma IS NOT NULL);
