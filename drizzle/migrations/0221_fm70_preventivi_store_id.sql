ALTER TABLE public.preventivi ADD COLUMN store_id uuid NULL REFERENCES public.stores(id);
UPDATE public.preventivi p SET store_id = s.id FROM public.stores s WHERE s.nome = p.filiale AND p.store_id IS NULL;
CREATE INDEX preventivi_store_id_idx ON public.preventivi(store_id);