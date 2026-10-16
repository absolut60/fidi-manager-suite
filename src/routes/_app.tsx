import { createFileRoute, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth, utenteAttivo } from "@/hooks/use-auth";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_app")({
  component: ProtectedAppLayout,
});

function ProtectedAppLayout() {
  const { session, loading, profilo } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const nonAttivo = !loading && !!session && !!profilo && !utenteAttivo(profilo);

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

  // Checkpoint obbligatorio: primo accesso / password reimpostata dall'admin
  if (profilo?.deve_cambiare_password === true && pathname !== "/cambia-password") {
    return <Navigate to="/cambia-password" replace />;
  }

  return (
    <TooltipProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </TooltipProvider>
  );
}
