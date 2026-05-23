import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Receipt, Users, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function fmtEuro(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));
}

export function DashboardFatturato() {
  const annoCorrente = new Date().getFullYear();
  const annoPrec = annoCorrente - 1;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-fatturato-globale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatturato_annuale_globale")
        .select("anno, num_clienti, num_fatture_totali, fatturato_totale")
        .in("anno", [annoCorrente, annoPrec]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byAnno = new Map<number, { fatturato: number; clienti: number; fatture: number }>();
  (data ?? []).forEach((r) => {
    byAnno.set(Number(r.anno), {
      fatturato: Number(r.fatturato_totale) || 0,
      clienti: Number(r.num_clienti) || 0,
      fatture: Number(r.num_fatture_totali) || 0,
    });
  });

  const cur = byAnno.get(annoCorrente);
  const prev = byAnno.get(annoPrec);
  const fatturatoCur = cur?.fatturato ?? 0;
  const fatturatoPrev = prev?.fatturato ?? 0;
  const variazione = fatturatoPrev > 0
    ? ((fatturatoCur - fatturatoPrev) / fatturatoPrev) * 100
    : fatturatoCur > 0 ? 100 : null;

  const TrendIcon = variazione == null ? Minus : variazione > 0 ? TrendingUp : variazione < 0 ? TrendingDown : Minus;
  const trendColor = variazione == null
    ? "text-muted-foreground"
    : variazione > 0 ? "text-success" : variazione < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Receipt className="size-4" /> Fatturato
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Fatturato {annoCorrente}</p>
          {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
            <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoCur)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{cur?.fatture ?? 0} fatture</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Fatturato {annoPrec}</p>
          {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
            <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoPrev)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{prev?.fatture ?? 0} fatture</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Variazione</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <div className={`mt-1 flex items-center gap-2 ${trendColor}`}>
              <TrendIcon className="size-5" />
              <span className="text-2xl font-bold tabular-nums">
                {variazione == null ? "—" : `${variazione > 0 ? "+" : ""}${variazione.toFixed(1)}%`}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">{annoCorrente} vs {annoPrec}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Clienti fatturati {annoCorrente}</p>
          {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
            <div className="flex items-center gap-2 mt-1">
              <Users className="size-5 text-primary" />
              <span className="text-2xl font-bold tabular-nums">{cur?.clienti ?? 0}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <FileText className="size-3" /> {cur?.fatture ?? 0} fatture totali
          </p>
        </Card>
      </div>
    </section>
  );
}
