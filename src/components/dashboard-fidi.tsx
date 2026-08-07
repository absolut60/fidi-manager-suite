import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  Calculator,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  PauseCircle,
  CircleAlert,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type DashboardFidi = {
  fido_concesso_eur: number;
  fido_concesso_clienti: number;
  fido_concesso_piccoli_n: number;
  fido_concesso_piccoli_eur: number;
  fido_proposto_eur: number;
  fido_proposto_clienti: number;
  fido_proposto_piccoli_n: number;
  fido_proposto_piccoli_eur: number;
  da_verificare_n: number;
  oltre_fido_n: number;
  oltre_fido_eur: number;
  insoluti_n: number;
  insoluti_eur: number;
  insoluti_non_bloccati_n: number;
  fermi_n: number;
  fermi_scaduto_eur: number;
  scaduto_eur: number;
  scaduto_over60_eur: number;
  aggiornato_al: string | null;
};

function euro(n: number, decimali = 0) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(n);
}

function numero(n: number) {
  return new Intl.NumberFormat("it-IT").format(n);
}

function dataOra(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DashboardFidi() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-fidi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_fidi");
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) ?? null;
      if (!r) return null;
      const num = (x: unknown) => Number(x ?? 0);
      return {
        ...r,
        fido_concesso_eur: num(r.fido_concesso_eur),
        fido_concesso_clienti: num(r.fido_concesso_clienti),
        fido_concesso_piccoli_n: num(r.fido_concesso_piccoli_n),
        fido_concesso_piccoli_eur: num(r.fido_concesso_piccoli_eur),
        fido_proposto_eur: num(r.fido_proposto_eur),
        fido_proposto_clienti: num(r.fido_proposto_clienti),
        fido_proposto_piccoli_n: num(r.fido_proposto_piccoli_n),
        fido_proposto_piccoli_eur: num(r.fido_proposto_piccoli_eur),
        da_verificare_n: num(r.da_verificare_n),
        oltre_fido_n: num(r.oltre_fido_n),
        oltre_fido_eur: num(r.oltre_fido_eur),
        insoluti_n: num(r.insoluti_n),
        insoluti_eur: num(r.insoluti_eur),
        insoluti_non_bloccati_n: num(r.insoluti_non_bloccati_n),
        fermi_n: num(r.fermi_n),
        fermi_scaduto_eur: num(r.fermi_scaduto_eur),
        scaduto_eur: num(r.scaduto_eur),
        scaduto_over60_eur: num(r.scaduto_over60_eur),
      } as DashboardFidi;
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-8 w-40" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Impossibile caricare i totali dei fidi.</p>
      </Card>
    );
  }

  const delta = data.fido_proposto_eur - data.fido_concesso_eur;
  const deltaPerc = data.fido_concesso_eur > 0 ? (delta / data.fido_concesso_eur) * 100 : 0;
  const positivo = delta >= 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Riquadro
          titolo="Fido concesso"
          valore={euro(data.fido_concesso_eur)}
          sottotitolo={`${numero(data.fido_concesso_clienti)} clienti con fido attivo`}
          icona={Wallet}
          tono="primary"
          nota={`di cui ${numero(data.fido_concesso_piccoli_n)} fidi ≤ 500 € · ${euro(data.fido_concesso_piccoli_eur)}`}
        />
        <Riquadro
          titolo="Fido proposto"
          valore={euro(data.fido_proposto_eur)}
          sottotitolo={`Calcolo teorico aggiornato al ${dataOra(data.aggiornato_al)}`}
          icona={Calculator}
          tono="info"
          nota={`di cui ${numero(data.fido_proposto_piccoli_n)} proposte ≤ 500 € · ${euro(data.fido_proposto_piccoli_eur)}`}
        />
        <Riquadro
          titolo="Variazione"
          valore={`${positivo ? "+" : "−"}${euro(Math.abs(delta))}`}
          sottotitolo={`${positivo ? "+" : "−"}${Math.abs(deltaPerc).toFixed(1)}% rispetto al concesso`}
          icona={positivo ? TrendingUp : TrendingDown}
          tono={positivo ? "success" : "warning"}
          nota={`${numero(data.da_verificare_n)} posizioni da verificare`}
          notaLink={{ to: "/clienti", search: { preset: "da_verificare" } }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Riquadro
          compatto
          titolo="Esposizione oltre il fido"
          valore={euro(data.oltre_fido_eur)}
          sottotitolo={`${numero(data.oltre_fido_n)} clienti oltre il fido concesso`}
          icona={AlertTriangle}
          tono="warning"
          notaLink={{ to: "/clienti", search: { preset: "oltre_fido" } }}
          nota="Vedi la lista"
        />
        <Riquadro
          compatto
          titolo="Insoluti in corso"
          valore={euro(data.insoluti_eur)}
          sottotitolo={`${numero(data.insoluti_n)} clienti · ${numero(data.insoluti_non_bloccati_n)} non bloccati (sotto trattativa)`}
          icona={CircleAlert}
          tono="danger"
        />
        <Riquadro
          compatto
          titolo="Clienti fermi"
          valore={numero(data.fermi_n)}
          sottotitolo={`Fatturato negli ultimi 12 mesi, nulla negli ultimi 3`}
          icona={PauseCircle}
          tono="info"
          nota={`Scaduto residuo: ${euro(data.fermi_scaduto_eur)}`}
        />
        <Riquadro
          compatto
          titolo="Scaduto totale"
          valore={euro(data.scaduto_eur)}
          sottotitolo={`di cui oltre 60 giorni: ${euro(data.scaduto_over60_eur)}`}
          icona={Clock}
          tono="warning"
          notaLink={{ to: "/clienti", search: { preset: "con_scaduto" } }}
          nota="Vedi i clienti con scaduto"
        />
      </div>
    </div>
  );
}

function Riquadro({
  titolo,
  valore,
  sottotitolo,
  icona: Icon,
  tono,
  nota,
  notaLink,
  compatto,
}: {
  titolo: string;
  valore: string;
  sottotitolo?: string;
  icona: LucideIcon;
  tono: "primary" | "success" | "warning" | "info" | "danger";
  nota?: string;
  notaLink?: { to: string; search: Record<string, string> };
  compatto?: boolean;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    danger: "bg-destructive/10 text-destructive",
  }[tono];

  return (
    <Card className={compatto ? "p-4" : "p-5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{titolo}</p>
          <p className={`font-bold text-foreground ${compatto ? "text-xl" : "text-2xl"}`}>{valore}</p>
          {sottotitolo && <p className="text-xs text-muted-foreground">{sottotitolo}</p>}
          {nota && (
            notaLink ? (
              <Link
                to={notaLink.to as any}
                search={notaLink.search as any}
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                {nota}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">{nota}</p>
            )
          )}
        </div>
        <div className={`size-10 shrink-0 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}
