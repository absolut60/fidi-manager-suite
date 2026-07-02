import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/cruscotto-incassi")({
  component: CruscottoIncassiPage,
});

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

type RigaMese = {
  mese: number;
  dovuto: number;
  incassato: number;
  da_incassare: number;
  pct: number;
  n_scadenze: number;
  n_pagate: number;
};

function fmtEuro(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function CruscottoIncassiPage() {
  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1;
  const annoCorrente = oggi.getFullYear();
  const [anno, setAnno] = useState<number>(annoCorrente);
  const [meseSel, setMeseSel] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cruscotto_incassi_mensile", anno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_cruscotto_incassi_mensile" as never,
        { _anno: anno } as never,
      );
      if (error) throw error;
      return ((data as unknown) as RigaMese[]) ?? [];
    },
  });

  const righe = data ?? [];
  const totali = useMemo(() => {
    const dovuto = righe.reduce((a, r) => a + Number(r.dovuto), 0);
    const incassato = righe.reduce((a, r) => a + Number(r.incassato), 0);
    return {
      dovuto,
      incassato,
      da_incassare: Math.max(dovuto - incassato, 0),
      pct: dovuto > 0 ? Math.min((incassato / dovuto) * 100, 100) : 0,
    };
  }, [righe]);

  const dettaglio = meseSel != null ? righe.find((r) => r.mese === meseSel) : null;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="size-6 text-primary" />
            Cruscotto incassi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Andamento mensile per data di scadenza — valori vivi, ricalcolati a ogni apertura.
          </p>
        </div>
        <div className="flex items-center gap-1 border rounded-md bg-background">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => { setAnno(anno - 1); setMeseSel(null); }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="px-3 text-sm font-semibold tabular-nums min-w-[3.5rem] text-center">
            {anno}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => { setAnno(anno + 1); setMeseSel(null); }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Totali anno */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TotBox label="Dovuto anno" value={fmtEuro(totali.dovuto)} />
          <TotBox label="Incassato" value={fmtEuro(totali.incassato)} tone="green" />
          <TotBox label="Da incassare" value={fmtEuro(totali.da_incassare)} tone="red" />
          <TotBox label="% incassato" value={fmtPct(totali.pct)} tone="neutral" />
        </div>
      </Card>

      {/* Griglia mesi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))
          : righe.map((r) => {
              const futuro =
                anno > annoCorrente || (anno === annoCorrente && r.mese > meseCorrente);
              const corrente = anno === annoCorrente && r.mese === meseCorrente;
              const attivo = meseSel === r.mese;
              return (
                <MeseCard
                  key={r.mese}
                  riga={r}
                  futuro={futuro}
                  corrente={corrente}
                  attivo={attivo}
                  onClick={() => setMeseSel(attivo ? null : r.mese)}
                />
              );
            })}
      </div>

      {/* Dettaglio mese selezionato */}
      {dettaglio && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Dettaglio mese
              </div>
              <div className="text-lg font-semibold">
                {MESI[dettaglio.mese - 1]} {anno}
              </div>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {dettaglio.n_pagate} / {dettaglio.n_scadenze} scadenze incassate
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TotBox label="Dovuto" value={fmtEuro(dettaglio.dovuto)} />
            <TotBox label="Incassato" value={fmtEuro(dettaglio.incassato)} tone="green" />
            <TotBox label="Da incassare" value={fmtEuro(dettaglio.da_incassare)} tone="red" />
            <TotBox label="% incassato" value={fmtPct(dettaglio.pct)} tone="neutral" />
          </div>
        </Card>
      )}
    </div>
  );
}

function TotBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "neutral";
}) {
  const color =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", color)}>{value}</div>
    </div>
  );
}

function MeseCard({
  riga,
  futuro,
  corrente,
  attivo,
  onClick,
}: {
  riga: RigaMese;
  futuro: boolean;
  corrente: boolean;
  attivo: boolean;
  onClick: () => void;
}) {
  const pct = Number(riga.pct);
  const badgeTone = futuro
    ? "bg-muted text-muted-foreground"
    : corrente
      ? "bg-primary/10 text-primary"
      : pct >= 90
        ? "bg-emerald-100 text-emerald-800"
        : pct >= 60
          ? "bg-amber-100 text-amber-800"
          : "bg-muted text-muted-foreground";

  const barPct = futuro ? 0 : Math.min(pct, 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:border-primary/40",
        attivo && "border-primary ring-2 ring-primary/20",
        futuro && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">
          {MESI[riga.mese - 1]}
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums",
            badgeTone,
          )}
        >
          {futuro ? "—" : fmtPct(pct)}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-red-100 overflow-hidden mb-3">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${barPct}%` }}
        />
      </div>

      <div className="space-y-1 text-xs">
        <Row label="Dovuto" value={fmtEuro(riga.dovuto)} />
        <Row
          label="Incassato"
          value={futuro ? "—" : fmtEuro(riga.incassato)}
          tone="green"
        />
        <Row
          label="Da incassare"
          value={futuro ? "—" : fmtEuro(riga.da_incassare)}
          tone="red"
        />
      </div>
    </button>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", color)}>{value}</span>
    </div>
  );
}
