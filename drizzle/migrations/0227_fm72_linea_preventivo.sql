CREATE TYPE public.linea_preventivo AS ENUM ('sistema_made', 'showroom', 'edilizia', 'fotovoltaico');
ALTER TABLE public.preventivi ADD COLUMN linea public.linea_preventivo NOT NULL DEFAULT 'sistema_made';
CREATE INDEX preventivi_linea_idx ON public.preventivi (linea);