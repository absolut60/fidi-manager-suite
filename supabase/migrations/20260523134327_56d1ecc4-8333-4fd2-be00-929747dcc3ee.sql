REVOKE ALL ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_importazione_counters(uuid, integer, integer, integer, integer) TO service_role;