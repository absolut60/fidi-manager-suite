REVOKE ALL ON TABLE public.note_preventivo_libreria FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.note_preventivo_libreria FROM authenticated;