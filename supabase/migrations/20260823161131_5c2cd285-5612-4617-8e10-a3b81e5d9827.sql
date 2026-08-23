DROP TRIGGER IF EXISTS trg_notifica_assegnazione_task ON public.task;
DROP FUNCTION IF EXISTS public.notifica_assegnazione_task();
REVOKE EXECUTE ON FUNCTION public.notifica_task_assegnato() FROM PUBLIC, anon, authenticated;