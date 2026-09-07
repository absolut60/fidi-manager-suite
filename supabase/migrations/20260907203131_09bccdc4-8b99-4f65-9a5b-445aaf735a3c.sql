CREATE OR REPLACE FUNCTION public.get_progresso_campagne_in_corso()
RETURNS TABLE(
  id uuid,
  stato text,
  inviati int,
  saltati int,
  falliti int,
  clic_unici int,
  clic_totali int,
  ultimo_invio_at timestamptz,
  avviata_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cam.id,
    cam.stato,
    COALESCE(cam.inviati, 0),
    COALESCE(cam.saltati, 0),
    COALESCE(cam.falliti, 0),
    COALESCE(cam.clic_unici, 0),
    COALESCE(cam.clic_totali, 0),
    (SELECT max(d.inviato_at) FROM public.campagne_email_destinatari d WHERE d.campagna_id = cam.id),
    COALESCE(cam.inviata_at, cam.updated_at, cam.created_at)
  FROM public.campagne_email_marketing cam
  WHERE cam.stato = 'in_corso';
$$;

GRANT EXECUTE ON FUNCTION public.get_progresso_campagne_in_corso() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_progresso_campagne_in_corso() TO service_role;