import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function fmtEuro(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v));
}

type Row = { anno: number; num_fatture: number; fatturato: number };

export function ClienteFatturato({ clienteId }: { clienteId: string }) {
  const annoCorrente = new Date().getFullYear();
  const annoPrec = annoCorrente - 1;

  const { data, isLoading } = useQuery({
    queryKey: ["cliente-fatturato", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatturato_clienti")
        .select("anno, num_fatture, fatturato")
        .eq("cliente_id", clienteId)
        .order("anno", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        anno: Number(r.anno) || 0,
        num_fatture: Number(r.num_fatture) || 0,
        fatturato: Number(r.fatturato) || 0,
      })) as Row[];
    },
  });

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fatturato</h3>
        <Skeleton className="h-32" />
      </section>
    );
  }

  const byAnno = new Map<number, Row>();
  (data ?? []).forEach((r) => byAnno.set(r.anno, r));
  const cur = byAnno.get(annoCorrente);
  const prev = byAnno.get(annoPrec);

  const fatturatoCur = cur?.fatturato ?? 0;
  const fatturatoPrev = prev?.fatturato ?? 0;
  const variazione = fatturatoPrev > 0
    ? ((fatturatoCur - fatturatoPrev) / fatturatoPrev) * 100
    : fatturatoCur > 0 ? 100 : null;

  // Ultimi 3 anni per il mini grafico
  const ultimi3 = [annoCorrente - 2, annoCorrente - 1, annoCorrente].map((a) => ({
    anno: a,
    fatturato: byAnno.get(a)?.fatturato ?? 0,
  }));
  const maxBar = Math.max(...ultimi3.map((r) => r.fatturato), 1);

  const TrendIcon = variazione == null ? Minus : variazione > 0 ? TrendingUp : variazione < 0 ? TrendingDown : Minus;
  const trendColor = variazione == null
    ? "text-muted-foreground"
    : variazione > 0 ? "text-success" : variazione < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Receipt className="size-4" /> Fatturato (IVA escl.)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Anno {annoCorrente} (IVA escl.)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoCur)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {cur?.num_fatture ?? 0} {cur?.num_fatture === 1 ? "fattura" : "fatture"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Anno {annoPrec} (IVA escl.)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{fmtEuro(fatturatoPrev)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {prev?.num_fatture ?? 0} {prev?.num_fatture === 1 ? "fattura" : "fatture"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Variazione</p>
          <div className={`mt-1 flex items-center gap-2 ${trendColor}`}>
            <TrendIcon className="size-5" />
            <span className="text-2xl font-bold tabular-nums">
              {variazione == null ? "—" : `${variazione > 0 ? "+" : ""}${variazione.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{annoCorrente} vs {annoPrec}</p>
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ultimi 3 anni</p>
        <div className="space-y-2">
          {ultimi3.map((r) => (
            <div key={r.anno} className="flex items-center gap-3 text-sm">
              <span className="w-12 font-medium tabular-nums">{r.anno}</span>
              <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(r.fatturato / maxBar) * 100}%` }}
                />
              </div>
              <span className="w-28 text-right tabular-nums font-medium">{fmtEuro(r.fatturato)}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
