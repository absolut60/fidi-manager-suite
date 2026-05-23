import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, FileText, Ban, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classificaScadenza } from "@/lib/scadenze";

export const Route = createFileRoute("/_app/scadenziario")({
  component: ScadenziarioPage,
});

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

type ScadRow = {
  cliente_id: string;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
  data_scadenza: string | null;
  stato_contabile: string | null;
  tempi_scadenza: string | null;
};
type Cliente = {
  id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  store_id: string | null;
  bloccato: boolean;
};
type StoreRow = { id: string; nome: string };

function fasciaOf(gg: number): "0_30" | "31_60" | "oltre_60" | null {
  if (gg <= 0) return null;
  if (gg <= 30) return "0_30";
  if (gg <= 60) return "31_60";
  return "oltre_60";
}

function fasciaBadge(f: "0_30" | "31_60" | "oltre_60" | null) {
  if (f === "oltre_60") return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">oltre 60gg</Badge>;
  if (f === "31_60") return <Badge className="bg-orange-500 text-white hover:bg-orange-500">31–60gg</Badge>;
  if (f === "0_30") return <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">1–30gg</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function ScadenziarioPage() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("all");
  const [fascia, setFascia] = useState<string>("tutte");
  const [importoMin, setImportoMin] = useState("");

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  const { data: clienti } = useQuery({
    queryKey: ["clienti-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, store_id, bloccato")
        .range(0, 4999);
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  const { data: scad, isLoading } = useQuery({
    queryKey: ["scadenze-globali"],
    queryFn: async () => {
      const all: ScadRow[] = [];
      const pageSize = 1000;
      let from = 0;
      // paginate to bypass 1000 row default
      while (true) {
        const { data, error } = await supabase
          .from("scadenze")
          .select("cliente_id, importo_scadenza, giorni_ritardo, data_scadenza, stato_contabile, tempi_scadenza")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as ScadRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const clientiMap = useMemo(() => {
    const m = new Map<string, Cliente>();
    (clienti ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [clienti]);

  const aggregato = useMemo(() => {
    const map = new Map<string, {
      cliente: Cliente;
      scadute: ScadRow[];
      aScadere: ScadRow[];
    }>();
    (scad ?? []).forEach((s) => {
      const cli = clientiMap.get(s.cliente_id);
      if (!cli) return;
      if (storeId !== "all" && cli.store_id !== storeId) return;
      const entry = map.get(s.cliente_id) ?? { cliente: cli, scadute: [], aScadere: [] };
      const gg = Number(s.giorni_ritardo ?? 0);
      if (gg > 0) entry.scadute.push(s);
      else entry.aScadere.push(s);
      map.set(s.cliente_id, entry);
    });
    return map;
  }, [scad, clientiMap, storeId]);

  const minImp = Number(importoMin) || 0;

  const scaduteRows = useMemo(() => {
    const rows = Array.from(aggregato.values()).map((e) => {
      const tot = e.scadute.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      const maxGg = e.scadute.reduce((m, r) => Math.max(m, Number(r.giorni_ritardo ?? 0)), 0);
      return {
        cliente: e.cliente,
        nFatture: e.scadute.length,
        totale: tot,
        maxGg,
        fascia: fasciaOf(maxGg),
      };
    }).filter((r) => r.nFatture > 0);
    return rows
      .filter((r) => r.totale >= minImp)
      .filter((r) => {
        if (fascia === "tutte") return true;
        return r.fascia === fascia;
      })
      .sort((a, b) => b.totale - a.totale);
  }, [aggregato, minImp, fascia]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit60 = new Date(today); limit60.setDate(limit60.getDate() + 60);

  const aScadereRows = useMemo(() => {
    const rows = Array.from(aggregato.values()).map((e) => {
      const filtered = e.aScadere.filter((r) => {
        if (!r.data_scadenza) return false;
        const d = new Date(r.data_scadenza); d.setHours(0, 0, 0, 0);
        return d >= today && d <= limit60;
      });
      const tot = filtered.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      const prossima = filtered
        .map((r) => r.data_scadenza)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;
      return {
        cliente: e.cliente,
        nFatture: filtered.length,
        totale: tot,
        prossima,
      };
    }).filter((r) => r.nFatture > 0 && r.totale >= minImp);
    return rows.sort((a, b) => (a.prossima ?? "").localeCompare(b.prossima ?? ""));
  }, [aggregato, minImp, today, limit60]);

  // KPI globali (non filtrati per store/fascia/importo)
  const kpi = useMemo(() => {
    const rows = scad ?? [];
    let totScad = 0, totAScadere = 0;
    const clientiScaduti = new Set<string>();
    rows.forEach((r) => {
      const gg = Number(r.giorni_ritardo ?? 0);
      const imp = Number(r.importo_scadenza ?? 0);
      if (gg > 0) { totScad += imp; clientiScaduti.add(r.cliente_id); }
      else totAScadere += imp;
    });
    const bloccati = (clienti ?? []).filter((c) => c.bloccato).length;
    return { totScad, totAScadere, clientiScaduti: clientiScaduti.size, bloccati };
  }, [scad, clienti]);

  function apriCliente(id: string) {
    navigate({ to: "/clienti/$clienteId", params: { clienteId: id }, search: { tab: "insoluti", insolutiTab: "scadenziario" } as never });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <CalendarClock className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scadenziario</h1>
          <p className="text-sm text-muted-foreground">Panoramica scaduti e prossime scadenze.</p>
        </div>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Totale scaduto" value={fmtEuro(kpi.totScad)} icon={AlertTriangle} tone="destructive" />
        <KpiCard label="Clienti con scaduto" value={String(kpi.clientiScaduti)} icon={FileText} tone="warning" />
        <KpiCard label="Totale a scadere" value={fmtEuro(kpi.totAScadere)} icon={Calendar} tone="info" />
        <KpiCard label="Clienti bloccati" value={String(kpi.bloccati)} icon={Ban} tone="destructive" />
      </div>

      {/* Filtri */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Store</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli store</SelectItem>
                {(stores ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fascia scaduto</label>
            <Select value={fascia} onValueChange={setFascia}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le fasce</SelectItem>
                <SelectItem value="0_30">1–30 giorni</SelectItem>
                <SelectItem value="31_60">31–60 giorni</SelectItem>
                <SelectItem value="oltre_60">oltre 60 giorni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Importo minimo €</label>
            <Input className="mt-1" type="number" inputMode="numeric" value={importoMin} onChange={(e) => setImportoMin(e.target.value)} placeholder="0" />
          </div>
        </div>
      </Card>

      {/* SCADUTO */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-destructive flex items-center gap-2">
          <AlertTriangle className="size-4" /> Scaduto — tutti i clienti
        </h2>
        {isLoading ? <Skeleton className="h-40" /> : scaduteRows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessun cliente con scaduto</Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cod. Gestionale</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">N. Fatture</TableHead>
                  <TableHead className="text-right">Totale scaduto</TableHead>
                  <TableHead className="text-right">Max gg ritardo</TableHead>
                  <TableHead>Fascia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scaduteRows.map((r) => {
                  const storeName = stores?.find((s) => s.id === r.cliente.store_id)?.nome ?? "—";
                  return (
                    <TableRow key={r.cliente.id} className="cursor-pointer" onClick={() => apriCliente(r.cliente.id)}>
                      <TableCell className="font-medium">{r.cliente.ragione_sociale}</TableCell>
                      <TableCell className="font-mono text-xs">{r.cliente.codice_gestionale ?? "—"}</TableCell>
                      <TableCell className="text-xs">{storeName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.nFatture}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-destructive">{fmtEuro(r.totale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.maxGg}</TableCell>
                      <TableCell>{fasciaBadge(r.fascia)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {/* A SCADERE */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-primary flex items-center gap-2">
          <Calendar className="size-4" /> A scadere — prossimi 60 giorni
        </h2>
        {isLoading ? <Skeleton className="h-40" /> : aScadereRows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna scadenza nei prossimi 60 giorni</Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cod. Gestionale</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">N. Fatture</TableHead>
                  <TableHead className="text-right">Totale a scadere</TableHead>
                  <TableHead>Prossima scadenza</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aScadereRows.map((r) => {
                  const storeName = stores?.find((s) => s.id === r.cliente.store_id)?.nome ?? "—";
                  return (
                    <TableRow key={r.cliente.id} className="cursor-pointer" onClick={() => apriCliente(r.cliente.id)}>
                      <TableCell className="font-medium">{r.cliente.ragione_sociale}</TableCell>
                      <TableCell className="font-mono text-xs">{r.cliente.codice_gestionale ?? "—"}</TableCell>
                      <TableCell className="text-xs">{storeName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.nFatture}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtEuro(r.totale)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(r.prossima)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof FileText; tone: "destructive" | "info" | "warning" | "default" }) {
  const cls = tone === "destructive" ? "bg-destructive/10 text-destructive"
    : tone === "info" ? "bg-primary/10 text-primary"
    : tone === "warning" ? "bg-orange-500/10 text-orange-600"
    : "bg-muted text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
        </div>
        <div className={`size-9 rounded-lg flex items-center justify-center ${cls}`}><Icon className="size-4" /></div>
      </div>
    </Card>
  );
}
