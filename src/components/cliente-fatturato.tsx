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

  const TrendIcon = variazione == null ? Minus : variazione > 0 ? TrendingUp : variazione < 0 ? TrendingDown : Minus;
  const trendColor = variazione == null
    ? "text-muted-foreground"
    : variazione > 0 ? "text-success" : variazione < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Receipt className="size-3.5" /> Fatturato (IVA escl.)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card className="px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">Anno {annoCorrente}</p>
          <p className="text-lg font-bold mt-0.5 tabular-nums">{fmtEuro(fatturatoCur)}</p>
          <p className="text-[10px] text-muted-foreground">
            {cur?.num_fatture ?? 0} {cur?.num_fatture === 1 ? "fattura" : "fatture"}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">Anno {annoPrec}</p>
          <p className="text-lg font-bold mt-0.5 tabular-nums">{fmtEuro(fatturatoPrev)}</p>
          <p className="text-[10px] text-muted-foreground">
            {prev?.num_fatture ?? 0} {prev?.num_fatture === 1 ? "fattura" : "fatture"}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">Variazione</p>
          <div className={`mt-0.5 flex items-center gap-1.5 ${trendColor}`}>
            <TrendIcon className="size-4" />
            <span className="text-lg font-bold tabular-nums">
              {variazione == null ? "—" : `${variazione > 0 ? "+" : ""}${variazione.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">{annoCorrente} vs {annoPrec}</p>
        </Card>
      </div>
    </section>
  );
}

