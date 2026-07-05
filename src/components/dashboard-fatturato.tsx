import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Receipt, Users, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function fmtEuro(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" }).format(d);
}

export function DashboardFatturato() {
  const annoCorrente = new Date().getFullYear();
  const annoPrec = annoCorrente - 1;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-fatturato-globale", annoCorrente, annoPrec],
    queryFn: async () => {
      const [annuale, ytd] = await Promise.all([
        supabase
          .from("fatturato_annuale_globale")
          .select("anno, num_clienti, num_fatture_totali, fatturato_totale")
          .in("anno", [annoCorrente, annoPrec]),
        supabase
          .from("fatturato_ytd_globale")
          .select("anno, num_clienti, num_fatture, fatturato, ytd_alla_data")
          .in("anno", [annoCorrente, annoPrec]),
      ]);
      if (annuale.error) throw annuale.error;
      if (ytd.error) throw ytd.error;
      return { annuale: annuale.data ?? [], ytd: ytd.data ?? [] };
    },
  });

  const annuale = new Map<number, { fatturato: number; clienti: number; fatture: number }>();
  (data?.annuale ?? []).forEach((r: any) => {
    annuale.set(Number(r.anno), {
      fatturato: Number(r.fatturato_totale) || 0,
      clienti: Number(r.num_clienti) || 0,
      fatture: Number(r.num_fatture_totali) || 0,
    });
  });

  const ytd = new Map<number, { fatturato: number; clienti: number; fatture: number; alla_data: string | null }>();
  (data?.ytd ?? []).forEach((r: any) => {
    ytd.set(Number(r.anno), {
      fatturato: Number(r.fatturato) || 0,
      clienti: Number(r.num_clienti) || 0,
      fatture: Number(r.num_fatture) || 0,
      alla_data: r.ytd_alla_data ?? null,
    });
  });

  const cur = annuale.get(annoCorrente);
  const prev = annuale.get(annoPrec);
  const ytdCur = ytd.get(annoCorrente);
  const ytdPrev = ytd.get(annoPrec);

  const fatturatoCur = cur?.fatturato ?? 0;
  const fatturatoPrev = prev?.fatturato ?? 0;

  // Variazione a parità di periodo (YTD vs YTD)
  const ytdCurVal = ytdCur?.fatturato ?? 0;
  const ytdPrevVal = ytdPrev?.fatturato ?? 0;
  const variazione = ytdPrevVal > 0
    ? ((ytdCurVal - ytdPrevVal) / ytdPrevVal) * 100
    : ytdCurVal > 0 ? 100 : null;

  const TrendIcon = variazione == null ? Minus : variazione > 0 ? TrendingUp : variazione < 0 ? TrendingDown : Minus;
  const trendColor = variazione == null
    ? "text-muted-foreground"
    : variazione > 0 ? "text-success" : variazione < 0 ? "text-destructive" : "text-muted-foreground";

  const dataYtd = ytdCur?.alla_data ?? ytdPrev?.alla_data ?? null;
  const dataYtdLabel = fmtDate(dataYtd);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Receipt className="size-4" /> Fatturato (IVA escl.)
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Fatturato {annoCorrente} (IVA escl.)</p>
          {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
            <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoCur)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{cur?.fatture ?? 0} fatture</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Fatturato {annoPrec} (IVA escl.)</p>
          {isLoading ? <Skeleton className="h-8 w-32 mt-1" /> : (
            <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoPrev)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {prev?.fatture ?? 0} fatture
            {dataYtdLabel && ytdPrev ? ` · al ${dataYtdLabel}: ${fmtEuro(ytdPrevVal)}` : ""}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Variazione YTD</p>
          {isLoading ? <Skeleton className="h-8 w-24 mt-1" /> : (
            <div className={`mt-1 flex items-center gap-2 ${trendColor}`}>
              <TrendIcon className="size-5" />
              <span className="text-2xl font-bold tabular-nums">
                {variazione == null ? "—" : `${variazione > 0 ? "+" : ""}${variazione.toFixed(1)}%`}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {annoCorrente} vs {annoPrec} · stesso periodo{dataYtdLabel ? ` (al ${dataYtdLabel})` : ""}
          </p>
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
