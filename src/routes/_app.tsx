import { createFileRoute, Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { serveCodice, statoSecondoFattore, type StatoSecondoFattore } from "@/lib/secondo-fattore";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth, utenteAttivo } from "@/hooks/use-auth";
import { useConfig, useConfigReady } from "@/hooks/use-config";
import { TooltipProvider } from "@/components/ui/tooltip";
import { giorniAllaScadenza, passwordDaCambiare } from "@/lib/regole-password";

export const Route = createFileRoute("/_app")({
  component: ProtectedAppLayout,
});

function ProtectedAppLayout() {
  const { session, loading, profilo } = useAuth();
  const config = useConfig();
  const configPronto = useConfigReady();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const nonAttivo = !loading && !!session && !!profilo && !utenteAttivo(profilo);
  const [statoMfa, setStatoMfa] = useState<StatoSecondoFattore | null>(null);
  const tokenSessione = session?.access_token;

  useEffect(() => {
    if (!tokenSessione) return;
    let annullato = false;
    statoSecondoFattore()
      .then((s) => { if (!annullato) setStatoMfa(s); })
      .catch(() => { /* in errore non si reindirizza */ });
    return () => { annullato = true; };
  }, [tokenSessione]);

  useEffect(() => {
    if (!nonAttivo) return;
    supabase.auth.signOut().finally(() => {
      navigate({ to: "/login", search: { motivo: "non_attivo" }, replace: true });
    });
  }, [nonAttivo, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Caricamento...
      </div>
    );
  }

  if (nonAttivo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Caricamento...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" />;
  }

  // Secondo fattore (FM44): sessione che richiede aal2 ma è ancora aal1.
  // Durante la lettura dello stato non si reindirizza.
  if (statoMfa && serveCodice(statoMfa)) {
    return <Navigate to="/verifica-codice" search={{ next: pathname }} replace />;
  }

  // Checkpoint obbligatorio (FM44): primo accesso, password reimpostata dall'admin,
  // mai cambiata o scaduta. Durante il caricamento di profilo/configurazione non si reindirizza.
  const giorni = config.scadenza_password_giorni;
  const pronto = !!profilo && configPronto;
  if (pronto && passwordDaCambiare(profilo, giorni) && pathname !== "/cambia-password") {
    return <Navigate to="/cambia-password" replace />;
  }

  const giorniRestanti = pronto ? giorniAllaScadenza(profilo, giorni) : null;
  const mostraAvviso =
    giorniRestanti !== null && giorniRestanti > 0 && giorniRestanti <= 7 && pathname !== "/cambia-password";

  return (
    <TooltipProvider>
      <AppShell>
        {mostraAvviso && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <KeyRound className="size-4 shrink-0" />
              <span className="min-w-0 break-words">
                La tua password scade tra {giorniRestanti} {giorniRestanti === 1 ? "giorno" : "giorni"}
              </span>
            </span>
            <Link to="/cambia-password" className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
              Cambia password
            </Link>
          </div>
        )}
        <Outlet />
      </AppShell>
    </TooltipProvider>
  );
}
