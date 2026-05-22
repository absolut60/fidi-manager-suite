import { createFileRoute } from "@tanstack/react-router";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Wallet,
  Clock,
  AlertTriangle,
  Plus,
  UserPlus,
  Upload,
  TrendingUp,
} from "lucide-react";
import { DashboardReminders } from "@/components/dashboard-reminders";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

type Metric = {
  label: string;
  value: string;
  icon: typeof FileText;
  tone: "primary" | "success" | "warning" | "info";
  hint?: string;
};

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

function DashboardPage() {
  const { profilo, role, loading } = useAuth();

  // Placeholder valori — verranno collegati alle tabelle dei fidi nella prossima iterazione
  const metrics: Metric[] = [
    { label: "Fidi attivi", value: "—", icon: Wallet, tone: "primary", hint: "Totale clienti con fido in corso" },
    { label: "Esposizione totale", value: formatEuro(0), icon: TrendingUp, tone: "success", hint: "Somma fidi assegnati" },
    { label: "In approvazione", value: "—", icon: Clock, tone: "info", hint: "Richieste in attesa" },
    { label: "In scadenza 30gg", value: "—", icon: AlertTriangle, tone: "warning", hint: "Fidi vicini alla scadenza" },
  ];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} loading={loading} />
        ))}
      </div>

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

function MetricCard({ metric, loading }: { metric: Metric; loading: boolean }) {
  const Icon = metric.icon;
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
  }[metric.tone];

  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {metric.label}
          </p>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold text-foreground">{metric.value}</p>
          )}
          {metric.hint && (
            <p className="text-xs text-muted-foreground">{metric.hint}</p>
          )}
        </div>
        <div className={`size-10 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
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
