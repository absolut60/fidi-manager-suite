REVOKE EXECUTE ON FUNCTION public._crea_contatto_da_iscritto(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crea_contatto_da_iscritto(uuid, uuid) TO service_role;