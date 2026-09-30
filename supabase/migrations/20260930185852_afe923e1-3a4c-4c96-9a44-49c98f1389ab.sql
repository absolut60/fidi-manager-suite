CREATE TRIGGER trg_invia_push_crescita_gruppo AFTER UPDATE OF conteggio ON public.notifiche
FOR EACH ROW WHEN (NEW.conteggio > OLD.conteggio AND NEW.letta = false AND OLD.aggiornata_at < now() - interval '2 minutes')
EXECUTE FUNCTION public.invia_push_da_notifica();
COMMENT ON TRIGGER trg_invia_push_crescita_gruppo ON public.notifiche IS 'FM36: push sulla crescita di un gruppo, al massimo una per ondata (2 minuti di quiete)';