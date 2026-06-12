import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  HandCoins,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CalendarIcon,
  Mail,
  Phone,
  Bell,
  StickyNote,
  FileText,
  Send,
} from "lucide-react";
import { InviaSollecitoDialog } from "@/components/invia-sollecito-dialog";
import { EmailInviataView } from "@/components/email-inviata-view";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";
import { toast } from "sonner";
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

function esitoBadge(e: Esito) {
  const map: Record<Esito, string> = {
    da_fare: "bg-yellow-500 text-white hover:bg-yellow-500",
    fatto: "bg-blue-500 text-white hover:bg-blue-500",
    nessuna_risposta: "bg-muted text-muted-foreground hover:bg-muted",
    promessa_pagamento: "bg-orange-500 text-white hover:bg-orange-500",
    contestazione: "bg-destructive text-destructive-foreground hover:bg-destructive",
    pagato: "bg-emerald-600 text-white hover:bg-emerald-600",
  };
  const label = ESITI.find((x) => x.value === e)?.label ?? e;
  return <Badge className={map[e]}>{label}</Badge>;
}

function tipoLabel(t: Tipo) {
  const T = TIPI.find((x) => x.value === t);
  if (!T) return <span>{t}</span>;
  const Icon = T.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" /> {T.label}
    </span>
  );
}

type AzioneRow = {
  id: string;
  cliente_id: string;
  operatore_id: string | null;
  tipo: Tipo;
  esito: Esito;
  data_azione: string;
  data_promessa_pagamento: string | null;
  importo_riferimento: number | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  created_at: string;
  cliente: {
    id: string;
    ragione_sociale: string;
    store_id: string | null;
  } | null;
};

function RecuperoCreditiPage() {
  const { role, profilo } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();

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
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promessaOpenFor, setPromessaOpenFor] = useState<string | null>(null);
  const [sollecitoFor, setSollecitoFor] = useState<{ clienteId: string; azioneId: string } | null>(null);
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [storeId, esitoFilter, tipoFilter, operatoreId, searchDebounced, dataDa, dataA]);

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

  // Operatori (profili)
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

  // Build base query (reusable for list, count, aggregates)
  function applyFilters(q: any): any {
    if (esitoFilter.size > 0) q = q.in("esito", Array.from(esitoFilter));
    if (tipoFilter.size > 0) q = q.in("tipo", Array.from(tipoFilter));
    if (operatoreId !== "all" && !isStoreManager) q = q.eq("operatore_id", operatoreId);
    if (dataDa) q = q.gte("data_azione", dataDa.toISOString());
    if (dataA) {
      const end = new Date(dataA);
      end.setHours(23, 59, 59, 999);
      q = q.lte("data_azione", end.toISOString());
    }
    return q;
  }

  // Azioni page
  const azioniQuery = useQuery({
    queryKey: [
      "azioni-recupero",
      page,
      Array.from(esitoFilter).sort(),
      Array.from(tipoFilter).sort(),
      storeId,
      operatoreId,
      searchDebounced,
      dataDa?.toISOString() ?? null,
      dataA?.toISOString() ?? null,
      isStoreManager,
    ],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("azioni_recupero")
        .select(
          "id, cliente_id, operatore_id, tipo, esito, data_azione, data_promessa_pagamento, importo_riferimento, note, email_oggetto, email_corpo_html, email_destinatario, created_at, cliente:clienti!inner(id, ragione_sociale, store_id)",
          { count: "exact" }
        )
        .order("data_azione", { ascending: false })
        .range(from, to);

      q = applyFilters(q);
      if (storeId !== "all") q = q.eq("cliente.store_id", storeId);
      if (searchDebounced) q = q.ilike("cliente.ragione_sociale", `%${searchDebounced}%`);

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as AzioneRow[],
        total: count ?? 0,
      };
    },
  });

  // Aggregates / metric cards (apply same filters, no pagination)
  const metricsQuery = useQuery({
    queryKey: [
      "azioni-recupero-metrics",
      Array.from(esitoFilter).sort(),
      Array.from(tipoFilter).sort(),
      storeId,
      operatoreId,
      searchDebounced,
      dataDa?.toISOString() ?? null,
      dataA?.toISOString() ?? null,
      isStoreManager,
    ],
    queryFn: async () => {
      let q = supabase
        .from("azioni_recupero")
        .select(
          "id, esito, importo_riferimento, cliente:clienti!inner(id, ragione_sociale, store_id)"
        );
      q = applyFilters(q);
      if (storeId !== "all") q = q.eq("cliente.store_id", storeId);
      if (searchDebounced) q = q.ilike("cliente.ragione_sociale", `%${searchDebounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      let totale = 0;
      let daFare = 0;
      let promesse = 0;
      let importo = 0;
      for (const r of rows as any[]) {
        totale++;
        if (r.esito === "da_fare") daFare++;
        if (r.esito === "promessa_pagamento") promesse++;
        importo += Number(r.importo_riferimento ?? 0);
      }
      return { totale, daFare, promesse, importo };
    },
  });

  // Scadenze counts for the visible page
  const pageIds = (azioniQuery.data?.rows ?? []).map((r) => r.id);
  const countsQuery = useQuery({
    queryKey: ["azioni-recupero-counts", pageIds.sort().join(",")],
    enabled: pageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select("azione_id")
        .in("azione_id", pageIds);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) {
        m[r.azione_id] = (m[r.azione_id] ?? 0) + 1;
      }
      return m;
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

  const storeMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of stores ?? []) m[s.id] = s.nome;
    return m;
  }, [stores]);

  async function updateEsito(id: string, nextEsito: Esito, dataPromessa?: Date | null) {
    const patch: { esito: Esito; data_promessa_pagamento?: string | null } = { esito: nextEsito };
    if (nextEsito === "promessa_pagamento" && dataPromessa) {
      patch.data_promessa_pagamento = dataPromessa.toISOString();
    } else if (nextEsito !== "promessa_pagamento") {
      patch.data_promessa_pagamento = null;
    }
    const { error } = await supabase
      .from("azioni_recupero")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Errore aggiornamento esito: " + error.message);
      return;
    }
    toast.success("Esito aggiornato");
    qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
    qc.invalidateQueries({ queryKey: ["azione-scadenze", id] });
  }

  async function handleEsitoChange(id: string, next: Esito) {
    if (next === "promessa_pagamento") {
      setPromessaOpenFor(id);
      return;
    }
    await updateEsito(id, next);
  }

  const total = azioniQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const n = new Set(set);
    if (n.has(value)) n.delete(value);
    else n.add(value);
    return n;
  }

  const m = metricsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HandCoins className="size-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recupero Crediti</h1>
          <p className="text-sm text-muted-foreground">
            Azioni di recupero su clienti con scaduto
          </p>
        </div>
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
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
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
                  <SelectItem key={o.id} value={o.id}>
                    {operatoreMap[o.id] ?? "—"}
                  </SelectItem>
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
                <TableHead>Cliente</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Esito</TableHead>
                <TableHead>Data azione</TableHead>
                <TableHead className="text-right">Importo rif.</TableHead>
                <TableHead className="text-center">Scad.</TableHead>
                <TableHead>Operatore</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {azioniQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-24 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {!azioniQuery.isLoading && (azioniQuery.data?.rows.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                    Nessuna azione di recupero trovata
                  </TableCell>
                </TableRow>
              )}
              {(azioniQuery.data?.rows ?? []).map((r) => {
                const expanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                        >
                          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.cliente?.ragione_sociale ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.cliente?.store_id ? storeMap[r.cliente.store_id] ?? "—" : "—"}
                      </TableCell>
                      <TableCell>{tipoLabel(r.tipo)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Select
                            value={r.esito}
                            onValueChange={(v) => handleEsitoChange(r.id, v as Esito)}
                          >
                            <SelectTrigger className="h-8 w-[170px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ESITI.map((e) => (
                                <SelectItem key={e.value} value={e.value}>
                                  {e.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {r.esito === "promessa_pagamento" && r.data_promessa_pagamento && (
                            <Badge variant="outline" className="whitespace-nowrap">
                              {fmtDate(r.data_promessa_pagamento)}
                            </Badge>
                          )}
                        </div>
                        {promessaOpenFor === r.id && (
                          <PromessaInline
                            onCancel={() => setPromessaOpenFor(null)}
                            onConfirm={async (d) => {
                              setPromessaOpenFor(null);
                              await updateEsito(r.id, "promessa_pagamento", d);
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDateTime(r.data_azione)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {fmtEuro(r.importo_riferimento)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{countsQuery.data?.[r.id] ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.operatore_id ? operatoreMap[r.operatore_id] ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] text-sm text-muted-foreground truncate">
                        {r.tipo === "email" && r.esito === "da_fare" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSollecitoFor({ clienteId: r.cliente_id, azioneId: r.id });
                            }}
                          >
                            <Send className="size-3.5" /> Invia
                          </Button>
                        ) : (
                          r.note ?? "—"
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={10}>
                          <DettaglioAzione
                            azione={r}
                            onApriCliente={() =>
                              navigate({
                                to: "/clienti/$clienteId",
                                params: { clienteId: r.cliente_id },
                              })
                            }
                          />
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
              ? "0 risultati"
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} di ${total}`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Precedente
            </Button>
            <span className="text-sm">
              Pag. {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Successiva
            </Button>
          </div>
        </div>
      </Card>

      {sollecitoFor && (
        <InviaSollecitoDialog
          open={!!sollecitoFor}
          onOpenChange={(v) => !v && setSollecitoFor(null)}
          clienteId={sollecitoFor.clienteId}
          azioneEsistenteId={sollecitoFor.azioneId}
          onSent={() => setSollecitoFor(null)}
        />
      )}

      <InvioMassivoDialog
        open={invioMassivoOpen}
        onOpenChange={setInvioMassivoOpen}
        clienteIdsSelezionati={[]}
        clienteIdsFiltrati={Array.from(new Set((azioniQuery.data?.rows ?? []).map((r) => r.cliente_id)))}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value: string | number;
  loading?: boolean;
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

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  onClear,
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
            {label}
            {selected.size > 0 ? ` (${selected.size})` : ""}
          </span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
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
  label,
  date,
  onChange,
}: {
  label: string;
  date: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {date ? `${label}: ${format(date, "dd/MM/yyyy")}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {date && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange(undefined)}
            >
              Rimuovi
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PromessaInline({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (d: Date) => void;
}) {
  const [d, setD] = useState<Date | undefined>();
  return (
    <div className="mt-2 flex items-center gap-2 p-2 rounded-md border bg-background">
      <span className="text-xs text-muted-foreground">Data promessa:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarIcon className="mr-2 size-3.5" />
            {d ? format(d, "dd/MM/yyyy") : "Scegli data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={d}
            onSelect={setD}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <Button size="sm" disabled={!d} onClick={() => d && onConfirm(d)}>
        Salva
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Annulla
      </Button>
    </div>
  );
}

function DettaglioAzione({
  azione,
  onApriCliente,
}: {
  azione: AzioneRow;
  onApriCliente: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["azione-scadenze", azione.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select(
          "scadenza:scadenze!inner(id, numero_documento, data_scadenza, importo_scadenza)"
        )
        .eq("azione_id", azione.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.scadenza);
    },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Note</div>
          <div className="text-sm whitespace-pre-wrap">{azione.note ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">
            Data azione
          </div>
          <div className="text-sm">{fmtDateTime(azione.data_azione)}</div>
          {azione.data_promessa_pagamento && (
            <>
              <div className="text-xs uppercase text-muted-foreground tracking-wider mt-2 mb-1">
                Promessa pagamento
              </div>
              <div className="text-sm">{fmtDate(azione.data_promessa_pagamento)}</div>
            </>
          )}
        </div>
        <div className="flex md:justify-end items-start">
          <Button variant="outline" size="sm" onClick={onApriCliente}>
            <ExternalLink className="size-4 mr-2" />
            Apri scheda cliente
          </Button>
        </div>
      </div>

      {azione.tipo === "email" && azione.email_corpo_html && (
        <EmailInviataView
          destinatario={azione.email_destinatario}
          oggetto={azione.email_oggetto}
          corpoHtml={azione.email_corpo_html}
        />
      )}

      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wider mb-2">
          Scadenze collegate
        </div>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">Nessuna scadenza collegata</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N. documento</TableHead>
                  <TableHead>Data scadenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.numero_documento ?? "—"}</TableCell>
                    <TableCell>{fmtDate(s.data_scadenza)}</TableCell>
                    <TableCell className="text-right">{fmtEuro(s.importo_scadenza)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
