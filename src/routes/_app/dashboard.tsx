import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  AlertTriangle,
  Plus,
  UserPlus,
  Upload,
} from "lucide-react";
import { DashboardReminders } from "@/components/dashboard-reminders";
import { DashboardFatturato } from "@/components/dashboard-fatturato";
import { DashboardFidi } from "@/components/dashboard-fidi";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { profilo, role, loading } = useAuth();


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {loading ? "..." : `Ciao ${profilo?.nome ?? ""}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role ? RUOLI_LABEL[role] : "—"} · Panoramica dei fidi commerciali
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" />
            Nuova richiesta
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <UserPlus className="size-4" />
            Nuovo cliente
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Upload className="size-4" />
            Importa
          </Button>
        </div>
      </div>

      <DashboardFidi />


      <DashboardFatturato />

      <DashboardReminders />

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
