-- FM55 fetta 7: rimozione delle funzioni temporanee di misura e confronto (create in 0129-0131).
DROP FUNCTION IF EXISTS public._fm55_nuova_get_fido_teorico_v2(uuid[]);
DROP FUNCTION IF EXISTS public._fm55_nuova_get_fido_teorico(uuid[], boolean);
DROP FUNCTION IF EXISTS public._fm55_diag_explain(text);