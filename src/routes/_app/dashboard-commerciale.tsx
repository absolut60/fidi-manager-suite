// Dashboard commerciale (CRM): KPI pipeline, stati, attività e classifica agenti.
// Il perimetro per-agente è applicato dentro le funzioni SQL (SECURITY DEFINER).
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Target, Trophy, Percent, CalendarClock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATI_OPPORTUNITA, STATO_LABEL, STATO_CLASS, fmtEuro, type StatoOpportunita } from "@/lib/opportunita";

export const Route = createFileRoute("/_app/dashboard-commerciale")({
  head: () => ({
    meta: [
      { title: "Dashboard commerciale — FidiManager" },
      { name: "description", content: "Quadro d'insieme della pipeline commerciale: valore in trattativa, opportunità per stato, attività e classifica agenti." },
      { property: "og:title", content: "Dashboard commerciale — FidiManager" },
      { property: "og:description", content: "Quadro d'insieme della pipeline commerciale: valore in trattativa, opportunità per stato, attività e classifica agenti." },
    ],
  }),
  component: DashboardCommercialePage,
});

type Metriche = {
  aperte_n: number; aperte_val: number;
  in_lavorazione_n: number; in_lavorazione_val: number;
  preventivo_n: number; preventivo_val: number;
  vinte_n: number; vinte_val: number;
  perse_n: number; perse_val: number;
  pipeline_aperta_val: number;
  tasso_conversione: number | null;
  valore_medio_vinta: number | null;
  attivita_da_fare_n: number;
  attivita_arretrate_n: number;
};

type RigaAgente = {
  agente_codice: string | null;
  agente_nome: string | null;
  aperte_n: number;
  pipeline_val: number;
  vinte_n: number;
  vinte_val: number;
  perse_n: number;
  tasso_conversione: number | null;
};

type Periodo = "mese" | "trimestre" | "anno" | "tutto";

const PERIODO_LABEL: Record<Periodo, string> = {
  mese: "Mese corrente",
  trimestre: "Trimestre corrente",
  anno: "Anno corrente",
  tutto: "Tutto",
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangePeriodo(p: Periodo): { da: string | null; a: string | null } {
  if (p === "tutto") return { da: null, a: null };
  const now = new Date();
  if (p === "mese") {
    return { da: iso(new Date(now.getFullYear(), now.getMonth(), 1)), a: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (p === "trimestre") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return { da: iso(new Date(now.getFullYear(), q, 1)), a: iso(new Date(now.getFullYear(), q + 3, 0)) };
  }
  return { da: iso(new Date(now.getFullYear(), 0, 1)), a: iso(new Date(now.getFullYear(), 11, 31)) };
}

function fmtPerc(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 }).format(v);
}

function DashboardCommercialePage() {
  const { roles } = useAuth();
  const isDirezionale = roles.some((r) => ["amministratore", "amministrazione", "direzione"].includes(r));

  const [periodo, setPeriodo] = useState<Periodo>("anno");
  const [agenteF, setAgenteF] = useState<string>("tutti");
  const { da, a } = rangePeriodo(periodo);

  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Array<{ codice: string; descrizione: string | null }>;
    },
    staleTime: 300_000,
    enabled: isDirezionale,
  });

  const { data: m, isLoading } = useQuery({
    queryKey: ["dash-commerciale", periodo, agenteF],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_commerciale", {
        _agente_codice: agenteF === "tutti" ? undefined : agenteF,
        _data_da: da ?? undefined,
        _data_a: a ?? undefined,
      });
      if (error) throw error;
      const r = (data as unknown as Metriche[])?.[0] ?? null;
      return r;
    },
  });

  const { data: classifica = [] } = useQuery({
    queryKey: ["dash-commerciale-agenti", periodo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_commerciale_per_agente", { _data_da: da ?? undefined, _data_a: a ?? undefined });
      if (error) throw error;
      return (data ?? []) as unknown as RigaAgente[];
    },
    enabled: isDirezionale,
  });

  const perStato = useMemo(() => {
    const src: Record<StatoOpportunita, { n: number; val: number }> = {
      aperta: { n: m?.aperte_n ?? 0, val: Number(m?.aperte_val ?? 0) },
      in_lavorazione: { n: m?.in_lavorazione_n ?? 0, val: Number(m?.in_lavorazione_val ?? 0) },
      preventivo: { n: m?.preventivo_n ?? 0, val: Number(m?.preventivo_val ?? 0) },
      vinta: { n: m?.vinte_n ?? 0, val: Number(m?.vinte_val ?? 0) },
      persa: { n: m?.perse_n ?? 0, val: Number(m?.perse_val ?? 0) },
    };
    const max = Math.max(1, ...STATI_OPPORTUNITA.map((s) => src[s].val));
    return STATI_OPPORTUNITA.map((s) => ({ stato: s, ...src[s], perc: (src[s].val / max) * 100 }));
  }, [m]);

  const kpi = [
    { label: "Pipeline aperta", value: fmtEuro(Number(m?.pipeline_aperta_val ?? 0)), sub: "valore in trattativa", icon: TrendingUp },
    { label: "Opportunità aperte", value: String((m?.aperte_n ?? 0) + (m?.in_lavorazione_n ?? 0) + (m?.preventivo_n ?? 0)), sub: "non ancora chiuse", icon: Target },
    { label: "Vinte nel periodo", value: `${m?.vinte_n ?? 0}`, sub: fmtEuro(Number(m?.vinte_val ?? 0)), icon: Trophy },
    { label: "Tasso di conversione", value: fmtPerc(m?.tasso_conversione == null ? null : Number(m.tasso_conversione)), sub: `${m?.vinte_n ?? 0} vinte / ${m?.perse_n ?? 0} perse`, icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard commerciale</h1>
          <p className="text-sm text-muted-foreground">Pipeline, attività e andamento delle opportunità</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIODO_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isDirezionale && (
            <Select value={agenteF} onValueChange={setAgenteF}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Tutti gli agenti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                {agenti.map((ag) => (
                  <SelectItem key={ag.codice} value={ag.codice}>{ag.descrizione ?? ag.codice}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpi.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                {isLoading ? (
                  <Skeleton className="mt-2 h-7 w-28" />
                ) : (
                  <p className="mt-1 truncate text-2xl font-semibold">{k.value}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
              </div>
              <k.icon className="h-5 w-5 shrink-0 text-teal-600" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Pipeline per stato</h2>
        <div className="space-y-3">
          {perStato.map((r) => (
            <div key={r.stato} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Badge variant="outline" className={STATO_CLASS[r.stato]}>{STATO_LABEL[r.stato]}</Badge>
                <span className="text-muted-foreground">
                  {r.n} {r.n === 1 ? "opportunità" : "opportunità"} · <span className="font-medium text-foreground">{fmtEuro(r.val)}</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-teal-600/70" style={{ width: `${r.perc}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Appuntamenti da fare</p>
              <p className="mt-1 text-2xl font-semibold">{m?.attivita_da_fare_n ?? 0}</p>
              <Link to="/calendario-commerciale" className="text-xs text-primary hover:underline">Apri il calendario</Link>
            </div>
            <CalendarClock className="h-5 w-5 text-teal-600" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Attività arretrate</p>
              <p className={`mt-1 text-2xl font-semibold ${(m?.attivita_arretrate_n ?? 0) > 0 ? "text-destructive" : ""}`}>
                {m?.attivita_arretrate_n ?? 0}
              </p>
              <Link to="/calendario-commerciale" className="text-xs text-primary hover:underline">Apri il calendario</Link>
            </div>
            <AlertTriangle className={`h-5 w-5 ${(m?.attivita_arretrate_n ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
        </Card>
      </div>

      {isDirezionale && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Classifica agenti</h2>

          {/* Mobile: schede impilate */}
          <div className="space-y-2 md:hidden">
            {classifica.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun dato nel periodo selezionato</p>
            ) : (
              classifica.map((r) => (
                <div key={r.agente_codice ?? "nessuno"} className="rounded-lg border p-3">
                  <p className="text-sm font-medium break-words">{r.agente_nome ?? "Non assegnato"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">Aperte: </span>{r.aperte_n}</div>
                    <div><span className="text-muted-foreground">Pipeline: </span>{fmtEuro(Number(r.pipeline_val ?? 0))}</div>
                    <div><span className="text-muted-foreground">Vinte: </span>{r.vinte_n} · {fmtEuro(Number(r.vinte_val ?? 0))}</div>
                    <div><span className="text-muted-foreground">Conversione: </span>{fmtPerc(r.tasso_conversione == null ? null : Number(r.tasso_conversione))}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead className="text-right">Aperte</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Vinte</TableHead>
                  <TableHead className="text-right">Conversione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classifica.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Nessun dato nel periodo selezionato
                    </TableCell>
                  </TableRow>
                ) : (
                  classifica.map((r) => (
                    <TableRow key={r.agente_codice ?? "nessuno"}>
                      <TableCell className="font-medium">{r.agente_nome ?? "Non assegnato"}</TableCell>
                      <TableCell className="text-right">{r.aperte_n}</TableCell>
                      <TableCell className="text-right">{fmtEuro(Number(r.pipeline_val ?? 0))}</TableCell>
                      <TableCell className="text-right">{r.vinte_n} · {fmtEuro(Number(r.vinte_val ?? 0))}</TableCell>
                      <TableCell className="text-right">{fmtPerc(r.tasso_conversione == null ? null : Number(r.tasso_conversione))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
