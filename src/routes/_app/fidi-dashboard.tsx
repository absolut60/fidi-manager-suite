import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle } from "lucide-react";
import { DashboardFatturato } from "@/components/dashboard-fatturato";
import { DashboardFidi } from "@/components/dashboard-fidi";
import { DashboardFidiDettaglio } from "@/components/dashboard-fidi-dettaglio";

export const Route = createFileRoute("/_app/fidi-dashboard")({
  component: FidiDashboardPage,
});

function FidiDashboardPage() {
  const { role } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Dashboard Fidi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {role ? RUOLI_LABEL[role] : "—"} · Panoramica dei fidi commerciali
        </p>
      </div>

      <DashboardFidi />

      <DashboardFidiDettaglio />

      <DashboardFatturato />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Ultime richieste</h2>
            <Button variant="ghost" size="sm">Vedi tutte</Button>
          </div>
          <EmptyState
            icon={FileText}
            title="Nessuna richiesta recente"
            description="Le richieste fido inviate appariranno qui."
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Fidi in scadenza</h2>
            <Button variant="ghost" size="sm">Vedi tutti</Button>
          </div>
          <EmptyState
            icon={AlertTriangle}
            title="Nessun fido in scadenza"
            description="Nei prossimi 30 giorni nessun fido scade."
          />
        </Card>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
