import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_app")({
  component: ProtectedAppLayout,
});

function ProtectedAppLayout() {
  const { session, loading, profilo } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
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
