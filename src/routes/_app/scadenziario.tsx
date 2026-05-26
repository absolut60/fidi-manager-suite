import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, FileText, Ban, CalendarClock, Scale, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  codice_pagamento: string | null;
};
type Cliente = {
  id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  store_id: string | null;
  bloccato: boolean;
  ind_blocco: number | null;
  in_gestione_legale: boolean;
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

function blockBadge(c: Cliente) {
  if (c.bloccato) return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Bloccato</Badge>;
  if (Number(c.ind_blocco ?? 0) === 1) return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Rev.</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function legaleBadge(c: Cliente) {
  if (c.in_gestione_legale) return <Badge className="bg-amber-500 text-white hover:bg-amber-500">⚖️ Legale</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function isBonifico(codice: string | null | undefined): boolean {
  if (!codice) return false;
  return codice.trim().toUpperCase() === "BOS";
}


function ScadenziarioPage() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("all");
  const [fascia, setFascia] = useState<string>("tutte");
  const [importoMin, setImportoMin] = useState("");
  const [statoBlocco, setStatoBlocco] = useState<"tutti" | "bloccati" | "non_bloccati">("tutti");
  const [statoLegale, setStatoLegale] = useState<"tutti" | "in_legale" | "non_in_legale">("tutti");
  const [escludiBonifici, setEscludiBonifici] = useState(true);
  const [escludiLegale, setEscludiLegale] = useState(true);
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);

  useEffect(() => {
    if (statoLegale === "in_legale") {
      setEscludiLegale(false);
    }
  }, [statoLegale]);

  const { data: rischioExpanded, isLoading: loadingRischio } = useQuery({
    queryKey: ["rischio-expanded", expandedClienteId],
    enabled: !!expandedClienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("fido_gestionale, fido_residuo, totale_rischio, doc_da_fatturare, doc_da_evadere, effetti_a_rischio, num_insoluti, dilazione_concordata, dilazione_effettiva")
        .eq("id", expandedClienteId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        fido_gestionale: number | null; fido_residuo: number | null; totale_rischio: number | null;
        doc_da_fatturare: number | null; doc_da_evadere: number | null; effetti_a_rischio: number | null;
        num_insoluti: number | null; dilazione_concordata: number | null; dilazione_effettiva: number | null;
      } | null;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  const { data: clienti } = useQuery({
    queryKey: ["clienti-min-scad"],
    queryFn: async () => {
      const all: Cliente[] = [];
      const size = 1000;
      let off = 0;
      while (true) {
        const { data, error } = await supabase
          .from("clienti")
          .select("id, ragione_sociale, codice_gestionale, store_id, bloccato, ind_blocco, in_gestione_legale")
          .range(off, off + size - 1);
        if (error) throw error;
        const batch = (data ?? []) as Cliente[];
        all.push(...batch);
        if (batch.length < size) break;
        off += size;
      }
      return all;
    },
  });

  const { data: scad, isLoading } = useQuery({
    queryKey: ["scadenze-globali-v2"],
    queryFn: async () => {
      const all: ScadRow[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("scadenze")
          .select("cliente_id, importo_scadenza, giorni_ritardo, data_scadenza, stato_contabile, tempi_scadenza, codice_pagamento")
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

  const annoCorrente = useMemo(() => new Date().getFullYear(), []);
  const annoPrec = annoCorrente - 1;

  const { data: fatturatoMap } = useQuery({
    queryKey: ["scadenziario-fatturato-clienti", annoCorrente, annoPrec],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatturato_clienti")
        .select("cliente_id, anno, fatturato")
        .in("anno", [annoCorrente, annoPrec]);
      if (error) throw error;
      const m = new Map<string, { cur: number; prev: number }>();
      for (const r of (data ?? []) as Array<{ cliente_id: string | null; anno: number | null; fatturato: number | null }>) {
        if (!r.cliente_id) continue;
        const entry = m.get(r.cliente_id) ?? { cur: 0, prev: 0 };
        if (Number(r.anno) === annoCorrente) entry.cur = Number(r.fatturato) || 0;
        else if (Number(r.anno) === annoPrec) entry.prev = Number(r.fatturato) || 0;
        m.set(r.cliente_id, entry);
      }
      return m;
    },
    staleTime: 60_000,
  });

  const clientiMap = useMemo(() => {
    const m = new Map<string, Cliente>();
    (clienti ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [clienti]);

  const bonificiCount = useMemo(() => {
    if (!escludiBonifici) return 0;
    return (scad ?? []).filter((r) => {
      const cat = classificaScadenza(r);
      return cat !== "pagato" && isBonifico(r.codice_pagamento);
    }).length;
  }, [scad, escludiBonifici]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const limit60 = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 60); return d; }, [today]);

  // Aggregazione per cliente, applicando filtri store / blocco / bonifici
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
      if (statoBlocco === "bloccati" && !cli.bloccato) return;
      if (statoBlocco === "non_bloccati" && cli.bloccato) return;
      if (statoLegale === "in_legale" && !cli.in_gestione_legale) return;
      if (statoLegale === "non_in_legale" && cli.in_gestione_legale) return;
      if (escludiLegale && cli.in_gestione_legale) return;
      if (escludiBonifici && isBonifico(s.codice_pagamento)) return;
      const cat = classificaScadenza(s);
      if (cat === "pagato") return;
      const entry = map.get(s.cliente_id) ?? { cliente: cli, scadute: [], aScadere: [] };
      if (cat === "scaduto") entry.scadute.push(s);
      else entry.aScadere.push(s);
      map.set(s.cliente_id, entry);
    });
    return map;
  }, [scad, clientiMap, storeId, statoBlocco, statoLegale, escludiBonifici, escludiLegale]);

  const minImp = Number(importoMin) || 0;

  // Riga unica per ogni cliente con almeno una scadenza aperta
  const rows = useMemo(() => {
    const out = Array.from(aggregato.values()).map((e) => {
      const totScad = e.scadute.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      const maxGg = e.scadute.reduce((m, r) => Math.max(m, Number(r.giorni_ritardo ?? 0)), 0);
      const aScadFiltered = e.aScadere.filter((r) => {
        if (!r.data_scadenza) return false;
        const d = new Date(r.data_scadenza); d.setHours(0, 0, 0, 0);
        return d >= today && d <= limit60;
      });
      const totAScad = aScadFiltered.reduce((a, r) => a + Number(r.importo_scadenza ?? 0), 0);
      const prossima = aScadFiltered
        .map((r) => r.data_scadenza)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;
      return {
        cliente: e.cliente,
        nScadute: e.scadute.length,
        totScad,
        nAScadere: aScadFiltered.length,
        totAScad,
        prossima,
        maxGg,
        fascia: fasciaOf(maxGg),
      };
    }).filter((r) => r.nScadute > 0);
    return out
      .filter((r) => r.totScad >= minImp)
      .filter((r) => {
        if (fascia === "tutte") return true;
        if (r.nScadute === 0) return false;
        return r.fascia === fascia;
      })
      .sort((a, b) => b.totScad - a.totScad);
  }, [aggregato, minImp, fascia, today, limit60]);

  // Conteggio clienti in legale esclusi dalla lista (per badge accanto al toggle).
  // Conta i clienti con scadenze aperte (non pagate, non bonifici) che verrebbero
  // mostrati se non fosse per il toggle.
  const legaleEsclusiCount = useMemo(() => {
    if (!escludiLegale) return 0;
    const ids = new Set<string>();
    (scad ?? []).forEach((s) => {
      const cli = clientiMap.get(s.cliente_id);
      if (!cli || !cli.in_gestione_legale) return;
      if (storeId !== "all" && cli.store_id !== storeId) return;
      if (escludiBonifici && isBonifico(s.codice_pagamento)) return;
      const cat = classificaScadenza(s);
      if (cat === "pagato") return;
      ids.add(cli.id);
    });
    return ids.size;
  }, [scad, clientiMap, escludiLegale, storeId, escludiBonifici]);

  // KPI calcolati sulla lista filtrata (rows) + clienti in legale (sull'intero dataset
  // prima del toggle "escludi legale", così rimane visibile anche quando li nasconde).
  const kpi = useMemo(() => {
    let totScad = 0, totAScad = 0, clientiScad = 0, bloccati = 0;
    rows.forEach((r) => {
      totScad += r.totScad;
      totAScad += r.totAScad;
      if (r.nScadute > 0) clientiScad += 1;
      if (r.cliente.bloccato) bloccati += 1;
    });
    // Clienti in legale con scadenze aperte (ignora toggle escludiLegale)
    const legaleIds = new Set<string>();
    (scad ?? []).forEach((s) => {
      const cli = clientiMap.get(s.cliente_id);
      if (!cli || !cli.in_gestione_legale) return;
      if (storeId !== "all" && cli.store_id !== storeId) return;
      if (escludiBonifici && isBonifico(s.codice_pagamento)) return;
      const cat = classificaScadenza(s);
      if (cat === "pagato") return;
      legaleIds.add(cli.id);
    });
    return { totScad, totAScad, clientiScad, bloccati, inLegale: legaleIds.size };
  }, [rows, scad, clientiMap, storeId, escludiBonifici]);

  function apriCliente(id: string) {
    navigate({ to: "/clienti/$clienteId", params: { clienteId: id }, search: { tab: "insoluti", insolutiTab: "scadenziario" } as never });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <CalendarClock className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scadenziario</h1>
          <p className="text-sm text-muted-foreground">Clienti con scadenze aperte — scaduto e a scadere a 60gg.</p>
        </div>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Totale scaduto" value={fmtEuro(kpi.totScad)} icon={AlertTriangle} tone="destructive" />
        <KpiCard label="Clienti con scaduto" value={String(kpi.clientiScad)} icon={FileText} tone="warning" />
        <KpiCard label="Totale a scadere" value={fmtEuro(kpi.totAScad)} icon={Calendar} tone="info" />
        <KpiCard label="Clienti bloccati" value={String(kpi.bloccati)} icon={Ban} tone="destructive" />
        <KpiCard label="Clienti in legale" value={String(kpi.inLegale)} icon={Scale} tone="warning" />
      </div>

      {/* Filtri */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            <label className="text-xs font-medium text-muted-foreground">Stato blocco</label>
            <Select value={statoBlocco} onValueChange={(v) => setStatoBlocco(v as typeof statoBlocco)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="bloccati">Solo bloccati</SelectItem>
                <SelectItem value="non_bloccati">Solo non bloccati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Stato legale</label>
            <Select value={statoLegale} onValueChange={(v) => setStatoLegale(v as typeof statoLegale)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="in_legale">In gestione legale</SelectItem>
                <SelectItem value="non_in_legale">Non in gestione legale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Importo minimo €</label>
            <Input className="mt-1" type="number" inputMode="numeric" value={importoMin} onChange={(e) => setImportoMin(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="escl-bonif" checked={escludiBonifici} onCheckedChange={setEscludiBonifici} />
              <Label htmlFor="escl-bonif" className="text-sm cursor-pointer">Escludi BOS (cod. pagamento = BOS)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="escl-legale" checked={escludiLegale} onCheckedChange={(v) => { setEscludiLegale(v); if (v) setStatoLegale("tutti"); }} />
              <Label htmlFor="escl-legale" className="text-sm cursor-pointer">Escludi gestione legale</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {escludiBonifici && <span>Esclusi {bonificiCount} BOS</span>}
            {escludiLegale && <span>Esclusi {legaleEsclusiCount} legale</span>}
          </div>
        </div>
      </Card>

      {/* TABELLA UNICA */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-foreground flex items-center gap-2">
          <FileText className="size-4" /> Clienti con scadenze aperte ({rows.length})
        </h2>
        {isLoading ? <Skeleton className="h-40" /> : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessun cliente con scadenze aperte</Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cod. Gestionale</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Stato blocco</TableHead>
                  <TableHead>Legale</TableHead>
                  <TableHead className="text-right">Fatt. {annoCorrente} (IVA escl.)</TableHead>
                  <TableHead className="text-right">Fatt. {annoPrec} (IVA escl.)</TableHead>
                  <TableHead className="text-right">N. Fatt. scadute</TableHead>
                  <TableHead className="text-right">Totale scaduto</TableHead>
                  <TableHead className="text-right">N. Fatt. a scadere</TableHead>
                  <TableHead className="text-right">Totale a scadere</TableHead>
                  <TableHead>Prossima scad.</TableHead>
                  <TableHead>Fascia</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const storeName = stores?.find((s) => s.id === r.cliente.store_id)?.nome ?? "—";
                  const fatt = fatturatoMap?.get(r.cliente.id);
                  const isExpanded = expandedClienteId === r.cliente.id;
                  return (
                    <Fragment key={r.cliente.id}>
                      <TableRow
                        key={r.cliente.id}
                        className={`cursor-pointer ${r.cliente.bloccato ? "bg-destructive/10 hover:bg-destructive/15" : r.cliente.in_gestione_legale ? "bg-amber-500/10 hover:bg-amber-500/15" : ""}`}
                        onClick={() => setExpandedClienteId(isExpanded ? null : r.cliente.id)}
                      >
                        <TableCell className="font-medium">{r.cliente.ragione_sociale}</TableCell>
                        <TableCell className="font-mono text-xs">{r.cliente.codice_gestionale ?? "—"}</TableCell>
                        <TableCell className="text-xs">{storeName}</TableCell>
                        <TableCell>{blockBadge(r.cliente)}</TableCell>
                        <TableCell>{legaleBadge(r.cliente)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fatt && fatt.cur > 0 ? fmtEuro(fatt.cur) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fatt && fatt.prev > 0 ? fmtEuro(fatt.prev) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.nScadute || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-destructive">
                          {r.totScad > 0 ? fmtEuro(r.totScad) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.nAScadere || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.totAScad > 0 ? fmtEuro(r.totAScad) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(r.prossima)}</TableCell>
                        <TableCell>{fasciaBadge(r.fascia)}</TableCell>
                        <TableCell className="w-8 text-muted-foreground">
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${r.cliente.id}-exp`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={14} className="px-4 py-3">
                            <ExpandedRischioPanel
                              loading={loadingRischio}
                              data={rischioExpanded}
                              onApri={(e: React.MouseEvent) => { e.stopPropagation(); apriCliente(r.cliente.id); }}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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

function ritardoText(dc: number | null, de: number | null): { text: string; cls: string } {
  if (dc == null || de == null) return { text: "—", cls: "text-muted-foreground" };
  const diff = Number(de) - Number(dc);
  if (diff > 0) return { text: `+${diff} gg`, cls: "text-destructive font-medium" };
  return { text: "In orario", cls: "text-success font-medium" };
}

type RischioData = {
  fido_gestionale: number | null; fido_residuo: number | null; totale_rischio: number | null;
  doc_da_fatturare: number | null; doc_da_evadere: number | null; effetti_a_rischio: number | null;
  num_insoluti: number | null; dilazione_concordata: number | null; dilazione_effettiva: number | null;
} | null | undefined;

function ExpandedRischioPanel({ loading, data, onApri }: { loading: boolean; data: RischioData; onApri: (e: React.MouseEvent) => void }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }
  const d = data ?? ({} as NonNullable<RischioData>);
  const fr = d.fido_residuo;
  const ddt = Number(d.doc_da_fatturare ?? 0);
  const ord = Number(d.doc_da_evadere ?? 0);
  const ni = d.num_insoluti;
  const eff = Number(d.effetti_a_rischio ?? 0);
  const r = ritardoText(d.dilazione_concordata ?? null, d.dilazione_effettiva ?? null);
  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <CellInfo label="Fido gestionale" value={fmtEuro(d.fido_gestionale)} />
        <CellInfo label="Fido residuo" value={fmtEuro(fr)} cls={fr != null && Number(fr) < 0 ? "text-destructive font-medium" : ""} />
        <CellInfo label="DDT da fatturare" value={fmtEuro(ddt)} cls={ddt > 0 ? "text-primary font-medium" : ""} />
        <CellInfo label="Ordini aperti" value={fmtEuro(ord)} hint="(non concorre)" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <CellInfo label="Insoluti storici" value={ni == null ? "—" : String(ni)} cls={ni != null && Number(ni) > 0 ? "text-destructive font-medium" : ""} />
        <CellInfo label="Effetti a rischio" value={fmtEuro(eff)} cls={eff > 0 ? "text-orange-600 font-medium" : ""} />
        <CellInfo label="Dilaz. concordata" value={d.dilazione_concordata != null ? `${d.dilazione_concordata} gg` : "—"} />
        <CellInfo label="Ritardo medio" value={r.text} cls={r.cls} />
      </div>
      <div className="pt-1">
        <button type="button" onClick={onApri} className="text-xs text-primary hover:underline font-medium">
          Apri scheda cliente →
        </button>
      </div>
    </div>
  );
}

function CellInfo({ label, value, cls, hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{label}</p>
      <p className={`tabular-nums truncate ${cls ?? ""}`}>{value}{hint && <span className="text-[10px] text-muted-foreground ml-1">{hint}</span>}</p>
    </div>
  );
}
