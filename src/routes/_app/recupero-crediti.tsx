import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarClock as CalendarClockIcon } from "lucide-react";
import { CreaAzioneDialog } from "@/components/crea-azione-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  HandCoins,
  Search,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
  Mail,
  Phone,
  Bell,
  StickyNote,
  FileText,
  Send,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";
import { ClienteAttivitaRecuperoTab } from "@/components/cliente-attivita-recupero-tab";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/recupero-crediti")({
  component: RecuperoCreditiPage,
});

const PAGE_SIZE = 50;

const ESITI = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "promessa_pagamento", label: "Promessa pagamento" },
  { value: "contestazione", label: "Contestazione" },
  { value: "pagato", label: "Pagato" },
] as const;

const TIPI = [
  { value: "email", label: "Email", icon: Mail },
  { value: "telefonata", label: "Telefonata", icon: Phone },
  { value: "promemoria", label: "Promemoria", icon: Bell },
  { value: "nota", label: "Nota", icon: StickyNote },
  { value: "lettera", label: "Lettera", icon: FileText },
] as const;

type Esito = (typeof ESITI)[number]["value"];
type Tipo = (typeof TIPI)[number]["value"];
type TabKey = "aperti" | "tutti" | "conclusi";
type SortKey = "priorita" | "ragione_sociale" | "scaduto" | "azioni_aperte" | "prossima" | "ultima";

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleDateString("it-IT");
  } catch {
    return String(v);
  }
}

function tipoLabel(t: string | null) {
  if (!t) return <span className="text-muted-foreground">—</span>;
  const T = TIPI.find((x) => x.value === t);
  if (!T) return <span>{t}</span>;
  const Icon = T.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" /> {T.label}
    </span>
  );
}

type ClienteAgg = {
  cliente_id: string;
  ragione_sociale: string;
  store_id: string | null;
  store_nome: string | null;
  totale_scaduto: number;
  azioni_totali: number;
  azioni_aperte: number;
  prossima_tipo: string | null;
  prossima_data: string | null;
  ultima_fatta_tipo: string | null;
  ultima_fatta_data: string | null;
  ha_promessa: boolean;
  data_promessa: string | null;
  in_ritardo: boolean;
};

function RecuperoCreditiPage() {
  const { role, profilo } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;

  // Filters
  const [storeId, setStoreId] = useState<string>(
    isStoreManager && myStoreId ? myStoreId : "all"
  );
  const [esitoFilter, setEsitoFilter] = useState<Set<Esito>>(new Set());
  const [tipoFilter, setTipoFilter] = useState<Set<Tipo>>(new Set());
  const [operatoreId, setOperatoreId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [dataDa, setDataDa] = useState<Date | undefined>();
  const [dataA, setDataA] = useState<Date | undefined>();
  const [tab, setTab] = useState<TabKey>("aperti");
  const [soloRitardo, setSoloRitardo] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("priorita");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);
  const [nuovaAzioneOpen, setNuovaAzioneOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [storeId, esitoFilter, tipoFilter, operatoreId, searchDebounced, dataDa, dataA, tab, soloRitardo, sortKey, sortDir]);

  // Stores
  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Operatori
  const { data: operatori } = useQuery({
    queryKey: ["operatori-list"],
    enabled: !isStoreManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profili")
        .select("id, nome, cognome, email")
        .order("cognome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtersKey = [
    Array.from(esitoFilter).sort(),
    Array.from(tipoFilter).sort(),
    storeId,
    operatoreId,
    searchDebounced,
    dataDa?.toISOString() ?? null,
    dataA?.toISOString() ?? null,
    isStoreManager,
  ];

  // Aggregato per cliente
  const aggQuery = useQuery({
    queryKey: ["recupero-clienti-aggregato", ...filtersKey],
    queryFn: async () => {
      const dataAEnd = dataA ? new Date(dataA) : null;
      if (dataAEnd) dataAEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc(
        "get_recupero_clienti_aggregato" as never,
        {
          _store_id: storeId !== "all" ? storeId : null,
          _operatore_id: operatoreId !== "all" && !isStoreManager ? operatoreId : null,
          _search: searchDebounced || null,
          _data_da: dataDa ? dataDa.toISOString() : null,
          _data_a: dataAEnd ? dataAEnd.toISOString() : null,
          _esiti: esitoFilter.size > 0 ? Array.from(esitoFilter) : null,
          _tipi: tipoFilter.size > 0 ? Array.from(tipoFilter) : null,
        } as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as ClienteAgg[];
    },
  });

  // Metric cards: conteggi sulle AZIONI (stessi filtri)
  const metricsQuery = useQuery({
    queryKey: ["azioni-recupero-metrics", ...filtersKey],
    queryFn: async () => {
      let q = supabase
        .from("azioni_recupero")
        .select(
          "id, esito, importo_riferimento, cliente:clienti!inner(id, store_id, ragione_sociale)"
        );
      if (esitoFilter.size > 0) q = q.in("esito", Array.from(esitoFilter));
      if (tipoFilter.size > 0) q = q.in("tipo", Array.from(tipoFilter));
      if (operatoreId !== "all" && !isStoreManager) q = q.eq("operatore_id", operatoreId);
      if (dataDa) q = q.gte("data_azione", dataDa.toISOString());
      if (dataA) {
        const end = new Date(dataA);
        end.setHours(23, 59, 59, 999);
        q = q.lte("data_azione", end.toISOString());
      }
      if (storeId !== "all") q = q.eq("cliente.store_id", storeId);
      if (searchDebounced) q = q.ilike("cliente.ragione_sociale", `%${searchDebounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      let totale = 0, daFare = 0, promesse = 0, importo = 0;
      for (const r of rows as any[]) {
        totale++;
        if (r.esito === "da_fare") daFare++;
        if (r.esito === "promessa_pagamento") promesse++;
        importo += Number(r.importo_riferimento ?? 0);
      }
      return { totale, daFare, promesse, importo };
    },
  });

  const operatoreMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operatori ?? []) {
      const nome = `${o.nome ?? ""} ${o.cognome ?? ""}`.trim();
      m[o.id] = nome || o.email || "—";
    }
    return m;
  }, [operatori]);

  // Filtro rapido + sort
  const sorted = useMemo(() => {
    const rows = aggQuery.data ?? [];
    const filtered = rows.filter((r) => {
      if (tab === "aperti") {
        if (!(r.azioni_aperte > 0)) return false;
        if (soloRitardo && !r.in_ritardo) return false;
        return true;
      }
      if (tab === "conclusi") return r.azioni_aperte === 0;
      return true;
    });
    const now = Date.now();
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: ClienteAgg, b: ClienteAgg) => {
      if (sortKey === "priorita") {
        // 1. aperte in ritardo (più vecchie prima)
        // 2. aperte future (prossima crescente)
        // 3. solo storico (ultima fatta più recente prima)
        const bucket = (x: ClienteAgg) => {
          if (x.in_ritardo) return 0;
          if (x.azioni_aperte > 0) return 1;
          return 2;
        };
        const ba = bucket(a), bb = bucket(b);
        if (ba !== bb) return ba - bb;
        if (ba === 0 || ba === 1) {
          const pa = a.prossima_data ? new Date(a.prossima_data).getTime() : Infinity;
          const pb = b.prossima_data ? new Date(b.prossima_data).getTime() : Infinity;
          return pa - pb;
        }
        const ua = a.ultima_fatta_data ? new Date(a.ultima_fatta_data).getTime() : 0;
        const ub = b.ultima_fatta_data ? new Date(b.ultima_fatta_data).getTime() : 0;
        return ub - ua;
      }
      if (sortKey === "ragione_sociale")
        return a.ragione_sociale.localeCompare(b.ragione_sociale) * dir;
      if (sortKey === "scaduto")
        return (Number(a.totale_scaduto) - Number(b.totale_scaduto)) * dir;
      if (sortKey === "azioni_aperte")
        return (a.azioni_aperte - b.azioni_aperte) * dir;
      if (sortKey === "prossima") {
        const pa = a.prossima_data ? new Date(a.prossima_data).getTime() : (dir > 0 ? Infinity : -Infinity);
        const pb = b.prossima_data ? new Date(b.prossima_data).getTime() : (dir > 0 ? Infinity : -Infinity);
        return (pa - pb) * dir;
      }
      if (sortKey === "ultima") {
        const ua = a.ultima_fatta_data ? new Date(a.ultima_fatta_data).getTime() : (dir > 0 ? Infinity : -Infinity);
        const ub = b.ultima_fatta_data ? new Date(b.ultima_fatta_data).getTime() : (dir > 0 ? Infinity : -Infinity);
        return (ua - ub) * dir;
      }
      return 0;
      void now;
    };
    return [...filtered].sort(cmp);
  }, [aggQuery.data, tab, soloRitardo, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const n = new Set(set);
    if (n.has(value)) n.delete(value);
    else n.add(value);
    return n;
  }
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const m = metricsQuery.data;
  const clienteIdsFiltrati = useMemo(
    () => Array.from(new Set(sorted.map((r) => r.cliente_id))),
    [sorted]
  );

  const counts = useMemo(() => {
    const rows = aggQuery.data ?? [];
    const aperti = rows.filter((r) => r.azioni_aperte > 0).length;
    return {
      tutti: rows.length,
      aperti,
      conclusi: rows.length - aperti,
      ritardo: rows.filter((r) => r.in_ritardo).length,
    };
  }, [aggQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HandCoins className="size-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recupero Crediti</h1>
          <p className="text-sm text-muted-foreground">
            Clienti con azioni di recupero — priorità agli aperti e in ritardo
          </p>
        </div>
        <Button size="sm" onClick={() => setNuovaAzioneOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Nuova azione
        </Button>
        <Button variant="outline" size="sm" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5">
          <Send className="size-4" /> Invio massivo solleciti
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Totale azioni" value={m?.totale ?? 0} loading={metricsQuery.isLoading} />
        <MetricCard label="Da fare" value={m?.daFare ?? 0} loading={metricsQuery.isLoading} tone="warning" />
        <MetricCard label="Promesse di pagamento" value={m?.promesse ?? 0} loading={metricsQuery.isLoading} tone="info" />
        <MetricCard label="Importo riferimento" value={fmtEuro(m?.importo ?? 0)} loading={metricsQuery.isLoading} tone="primary" />
      </div>

      {/* Tabs cliente */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="aperti" className="gap-1.5">
              <Clock className="size-3.5" /> Aperti ({counts.aperti})
            </TabsTrigger>
            <TabsTrigger value="tutti" className="gap-1.5">
              <CheckCircle2 className="size-3.5" /> Tutti ({counts.tutti})
            </TabsTrigger>
            <TabsTrigger value="conclusi" className="gap-1.5">
              <CheckCircle2 className="size-3.5" /> Conclusi ({counts.conclusi})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "aperti" && (
          <button
            type="button"
            onClick={() => setSoloRitardo((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors",
              soloRitardo
                ? "bg-destructive text-destructive-foreground border-destructive"
                : "bg-background hover:bg-muted text-foreground border-border"
            )}
          >
            <AlertTriangle className="size-3.5" /> Solo in ritardo ({counts.ritardo})
          </button>
        )}
      </div>


      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Cerca ragione sociale…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <MultiSelectFilter
            label="Esito"
            options={ESITI.map((e) => ({ value: e.value, label: e.label }))}
            selected={esitoFilter}
            onChange={(v) => setEsitoFilter(toggleSet(esitoFilter, v as Esito))}
            onClear={() => setEsitoFilter(new Set())}
          />

          <MultiSelectFilter
            label="Tipo"
            options={TIPI.map((t) => ({ value: t.value, label: t.label }))}
            selected={tipoFilter}
            onChange={(v) => setTipoFilter(toggleSet(tipoFilter, v as Tipo))}
            onClear={() => setTipoFilter(new Set())}
          />

          {!isStoreManager && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli store</SelectItem>
                {(stores ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!isStoreManager && (
            <Select value={operatoreId} onValueChange={setOperatoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Operatore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli operatori</SelectItem>
                {(operatori ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{operatoreMap[o.id] ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DateRangePicker label="Da" date={dataDa} onChange={setDataDa} />
          <DateRangePicker label="A" date={dataA} onChange={setDataA} />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <SortableHead label="Cliente" k="ragione_sociale" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Store</TableHead>
                <SortableHead label="Scaduto" k="scaduto" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortableHead label="Aperte" k="azioni_aperte" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center" />
                <SortableHead label="Prossima" k="prossima" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableHead label="Ultima fatta" k="ultima" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-24 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {!aggQuery.isLoading && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    Nessun cliente con azioni di recupero
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((r) => {
                const expanded = expandedClienteId === r.cliente_id;
                const hasAperte = r.azioni_aperte > 0;
                const prossimaInRitardo = r.in_ritardo;
                return (
                  <Fragment key={r.cliente_id}>
                    <TableRow
                      className={cn(
                        "cursor-pointer hover:bg-muted/40",
                        prossimaInRitardo && "border-l-2 border-l-destructive",
                        hasAperte && !prossimaInRitardo && "border-l-2 border-l-yellow-500",
                        !hasAperte && "opacity-80"
                      )}
                      onClick={() => setExpandedClienteId(expanded ? null : r.cliente_id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setExpandedClienteId(expanded ? null : r.cliente_id)}
                        >
                          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.ragione_sociale}</span>
                          {r.ha_promessa && (
                            <Badge className="bg-orange-500 text-white hover:bg-orange-500 whitespace-nowrap">
                              Promessa {r.data_promessa ? fmtDate(r.data_promessa) : ""}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.store_nome ?? "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right whitespace-nowrap font-medium",
                        Number(r.totale_scaduto) > 0 && "text-destructive"
                      )}>
                        {fmtEuro(r.totale_scaduto)}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasAperte ? (
                          <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">
                            {r.azioni_aperte}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">0</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {r.prossima_data ? (
                          <div className="flex items-center gap-2">
                            {tipoLabel(r.prossima_tipo)}
                            <span className={cn(prossimaInRitardo ? "text-destructive font-medium" : "text-muted-foreground")}>
                              {fmtDateTime(r.prossima_data)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {r.ultima_fatta_data ? (
                          <div className="flex items-center gap-2">
                            {tipoLabel(r.ultima_fatta_tipo)}
                            <span className="text-muted-foreground">{fmtDateTime(r.ultima_fatta_data)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {prossimaInRitardo ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" /> In ritardo
                          </Badge>
                        ) : hasAperte ? (
                          <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">Aperte</Badge>
                        ) : (
                          <Badge variant="secondary">Solo storico</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={8}>
                          <div className="p-2">
                            <ClienteAttivitaRecuperoTab clienteId={r.cliente_id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3 border-t">
          <div className="text-sm text-muted-foreground">
            {total === 0
              ? "0 clienti"
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} di ${total} clienti`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Precedente
            </Button>
            <span className="text-sm">Pag. {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Successiva
            </Button>
          </div>
        </div>
      </Card>

      <InvioMassivoDialog
        open={invioMassivoOpen}
        onOpenChange={setInvioMassivoOpen}
        clienteIdsSelezionati={[]}
        clienteIdsFiltrati={clienteIdsFiltrati}
      />

      <CreaAzioneDialog
        open={nuovaAzioneOpen}
        onOpenChange={setNuovaAzioneOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["recupero-clienti-aggregato"] });
          qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
        }}
      />
    </div>
  );
}

function MetricCard({
  label, value, loading, tone = "default",
}: {
  label: string; value: string | number; loading?: boolean;
  tone?: "default" | "warning" | "info" | "primary";
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-yellow-600",
    info: "text-orange-600",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="h-8 w-24 mt-1" />
      ) : (
        <div className={cn("text-2xl font-semibold mt-1", toneClass)}>{value}</div>
      )}
    </Card>
  );
}

function QuickChip({
  active, onClick, icon, children, tone,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors",
        active
          ? tone === "danger"
            ? "bg-destructive text-destructive-foreground border-destructive"
            : "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted text-foreground border-border"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SortableHead({
  label, k, sortKey, sortDir, onClick, align,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void; align?: "right" | "center";
}) {
  const active = sortKey === k;
  return (
    <TableHead className={cn(align === "right" && "text-right", align === "center" && "text-center")}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
        onClick={() => onClick(k)}
      >
        {label}
        {active && (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </TableHead>
  );
}

function MultiSelectFilter({
  label, options, selected, onChange, onClear,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="justify-between font-normal">
          <span className="truncate">
            {label}{selected.size > 0 ? ` (${selected.size})` : ""}
          </span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
          {selected.size > 0 && (
            <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">
              Azzera
            </button>
          )}
        </DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.has(o.value)}
            onCheckedChange={() => onChange(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DateRangePicker({
  label, date, onChange,
}: {
  label: string; date: Date | undefined; onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 size-4" />
          {date ? `${label}: ${format(date, "dd/MM/yyyy")}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
        {date && (
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>
              Rimuovi
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
