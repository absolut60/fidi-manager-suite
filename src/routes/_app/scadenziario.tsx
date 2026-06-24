import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, Fragment, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Calendar, FileText, Ban, CalendarClock, Scale, ChevronDown, ChevronUp, Megaphone, Mail, Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

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

// Riga ritornata dalla RPC get_scadenziario_lista_paginata
type ScadRow = {
  cliente_id: string;
  ragione_sociale: string;
  codice_gestionale: string | null;
  store_id: string | null;
  store_nome: string | null;
  bloccato: boolean;
  ind_blocco: number | null;
  in_gestione_legale: boolean;
  n_scadute: number;
  tot_scaduto: number | string;
  n_a_scadere: number;
  tot_a_scadere: number | string;
  prossima_scadenza: string | null;
  max_gg_ritardo: number;
  scadute_ids: string[] | null;
  fascia: "0_30" | "31_60" | "oltre_60" | null;
  fatturato_cur: number | string;
  fatturato_prec: number | string;
  avvisato_n: number;
  avvisato_ha_email: boolean;
  avvisato_ultima_tipo: string | null;
  avvisato_ultima_data: string | null;
  total_count: number | string;
};

type TotaliRow = {
  n_clienti_totali: number;
  tot_scaduto: number | string;
  tot_a_scadere: number | string;
  n_clienti_scaduti: number;
  n_clienti_bloccati: number;
  n_clienti_in_legale: number;
  n_clienti_crediti: number;
  tot_crediti: number | string;
  n_bonifici_esclusi: number;
  n_legale_esclusi: number;
};

function fasciaBadge(f: "0_30" | "31_60" | "oltre_60" | null) {
  if (f === "oltre_60") return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">oltre 60gg</Badge>;
  if (f === "31_60") return <Badge className="bg-orange-500 text-white hover:bg-orange-500">31–60gg</Badge>;
  if (f === "0_30") return <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">1–30gg</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function blockBadge(c: { bloccato: boolean; ind_blocco: number | null }) {
  if (c.bloccato) return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Bloccato</Badge>;
  if (Number(c.ind_blocco ?? 0) === 1) return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Rev.</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function legaleBadge(c: { in_gestione_legale: boolean }) {
  if (c.in_gestione_legale) return <Badge className="bg-amber-500 text-white hover:bg-amber-500">⚖️ Legale</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

const PAGE_SIZE = 25;

function ScadenziarioPage() {
  const navigate = useNavigate();
  const { role, profilo, user } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;
  const [storeId, setStoreId] = useState(isStoreManager && myStoreId ? myStoreId : "all");
  const [fascia, setFascia] = useState<string>("tutte");
  const [importoMin, setImportoMin] = useState("");
  const [statoBlocco, setStatoBlocco] = useState<"tutti" | "bloccati" | "non_bloccati">("tutti");
  const [statoLegale, setStatoLegale] = useState<"tutti" | "in_legale" | "non_in_legale">("tutti");
  const [escludiBonifici, setEscludiBonifici] = useState(true);
  const [escludiLegale, setEscludiLegale] = useState(true);
  const [avvisatoFilter, setAvvisatoFilter] = useState<"tutti" | "con_azioni" | "senza_azioni">("tutti");
  const [mostraACredito, setMostraACredito] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"tot_scaduto" | "tot_a_scadere" | "ragione_sociale" | "max_gg">("tot_scaduto");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);
  const [loadingAllIds, setLoadingAllIds] = useState(false);

  // Debounce ricerca
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset selezione + pagina ai cambi filtro
  useEffect(() => {
    setSelectedIds(new Set());
    setPage(1);
  }, [storeId, fascia, importoMin, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, mostraACredito, searchDebounced, sortBy, sortDir]);

  useEffect(() => {
    if (statoLegale === "in_legale") setEscludiLegale(false);
  }, [statoLegale]);

  const annoCorrente = useMemo(() => new Date().getFullYear(), []);
  const annoPrec = annoCorrente - 1;
  const minImp = Number(importoMin) || 0;

  const commonParams = useMemo(() => ({
    p_search: searchDebounced || null,
    p_store_id: storeId === "all" ? null : storeId,
    p_fascia: fascia,
    p_stato_blocco: statoBlocco,
    p_stato_legale: statoLegale,
    p_escludi_bonifici: escludiBonifici,
    p_escludi_legale: escludiLegale,
    p_avvisato: avvisatoFilter,
    p_importo_min: minImp,
    p_mostra_a_credito: mostraACredito,
  }), [searchDebounced, storeId, fascia, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, minImp, mostraACredito]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["scadenziario-paginata-v1", commonParams, sortBy, sortDir, page, annoCorrente, annoPrec],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenziario_lista_paginata" as never, {
        ...commonParams,
        p_anno_corrente: annoCorrente,
        p_anno_prec: annoPrec,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_page: page,
        p_page_size: PAGE_SIZE,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ScadRow[];
    },
  });

  const { data: totali } = useQuery({
    queryKey: ["scadenziario-totali-v1", commonParams],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenziario_totali" as never, commonParams as never);
      if (error) throw error;
      const arr = (data ?? []) as unknown as TotaliRow[];
      return arr[0] ?? null;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
    staleTime: 5 * 60_000,
  });

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

  const totalCount = Number(rows?.[0]?.total_count ?? totali?.n_clienti_totali ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const kpi = useMemo(() => {
    const t = totali;
    return {
      totScad: Number(t?.tot_scaduto ?? 0),
      totAScad: Number(t?.tot_a_scadere ?? 0),
      clientiScad: Number(t?.n_clienti_scaduti ?? 0),
      bloccati: Number(t?.n_clienti_bloccati ?? 0),
      inLegale: Number(t?.n_clienti_in_legale ?? 0),
      nCrediti: Number(t?.n_clienti_crediti ?? 0),
      totCrediti: Number(t?.tot_crediti ?? 0),
    };
  }, [totali]);

  const bonificiCount = Number(totali?.n_bonifici_esclusi ?? 0);
  const legaleEsclusiCount = Number(totali?.n_legale_esclusi ?? 0);

  function apriCliente(id: string) {
    navigate({ to: "/clienti/$clienteId", params: { clienteId: id }, search: { tab: "insoluti", insolutiTab: "scadenziario" } as never });
  }

  const pageRows = rows ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <CalendarClock className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scadenziario</h1>
          <p className="text-sm text-muted-foreground">Clienti con scadenze aperte — scaduto e a scadere</p>
        </div>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Totale scaduto"
          value={fmtEuro(mostraACredito ? kpi.totScad + kpi.totCrediti : kpi.totScad)}
          icon={AlertTriangle}
          tone="destructive"
          sublabel={mostraACredito ? (kpi.totCrediti < 0 ? `netto note di credito (${fmtEuro(kpi.totCrediti)})` : "netto note di credito") : undefined}
          tooltip={mostraACredito ? `Scaduto debitori: ${fmtEuro(kpi.totScad)} − Note di credito: ${fmtEuro(Math.abs(kpi.totCrediti))} = Netto: ${fmtEuro(kpi.totScad + kpi.totCrediti)}` : undefined}
        />
        <KpiCard
          label="Clienti con scaduto"
          value={String(kpi.clientiScad)}
          icon={FileText}
          tone="warning"
          sublabel={mostraACredito && kpi.nCrediti > 0 ? `di cui ${kpi.nCrediti} a credito` : undefined}
        />
        <KpiCard label="Totale a scadere" value={fmtEuro(kpi.totAScad)} icon={Calendar} tone="info" />
        <KpiCard label="Clienti bloccati" value={String(kpi.bloccati)} icon={Ban} tone="destructive" />
        <KpiCard label="Clienti in legale" value={String(kpi.inLegale)} icon={Scale} tone="warning" />
      </div>
      {mostraACredito && kpi.nCrediti > 0 && (
        <p className="text-xs text-muted-foreground -mt-2">
          Scomposizione totale scaduto: <span className="font-medium text-foreground">{fmtEuro(kpi.totScad)}</span> (debitori)
          {" − "}<span className="font-medium text-emerald-700 dark:text-emerald-400">{fmtEuro(Math.abs(kpi.totCrediti))}</span> (note di credito)
          {" = "}<span className="font-semibold text-foreground">{fmtEuro(kpi.totScad + kpi.totCrediti)}</span> netto
        </p>
      )}

      {/* Filtri */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Cerca cliente</label>
            <Input className="mt-1" placeholder="Ragione sociale o codice gestionale" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {!isStoreManager && (
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
          )}
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
          <div>
            <label className="text-xs font-medium text-muted-foreground">Azioni di recupero</label>
            <Select value={avvisatoFilter} onValueChange={(v) => setAvvisatoFilter(v as typeof avvisatoFilter)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="con_azioni">Con azioni sullo scaduto attuale</SelectItem>
                <SelectItem value="senza_azioni">Senza azioni (da contattare)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ordina per</label>
            <Select value={`${sortBy}:${sortDir}`} onValueChange={(v) => { const [b, d] = v.split(":"); setSortBy(b as typeof sortBy); setSortDir(d as typeof sortDir); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tot_scaduto:desc">Scaduto ↓</SelectItem>
                <SelectItem value="tot_scaduto:asc">Scaduto ↑</SelectItem>
                <SelectItem value="tot_a_scadere:desc">A scadere ↓</SelectItem>
                <SelectItem value="max_gg:desc">Giorni ritardo ↓</SelectItem>
                <SelectItem value="ragione_sociale:asc">Ragione sociale A→Z</SelectItem>
                <SelectItem value="ragione_sociale:desc">Ragione sociale Z→A</SelectItem>
              </SelectContent>
            </Select>
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
            <div className="flex items-center gap-2">
              <Switch id="mostra-credito" checked={mostraACredito} onCheckedChange={setMostraACredito} />
              <Label htmlFor="mostra-credito" className="text-sm cursor-pointer">Mostra anche clienti a credito (note di credito aperte)</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {escludiBonifici && <span>Esclusi {bonificiCount} BOS</span>}
            {escludiLegale && <span>Esclusi {legaleEsclusiCount} legale</span>}
            {mostraACredito && kpi.nCrediti > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                Note di credito aperte: {kpi.nCrediti} clienti, totale {fmtEuro(kpi.totCrediti)}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Barra azioni selezione */}
      {selectedIds.size > 0 && (
        <Card className="p-3 flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5">
          <div className="text-sm">
            <span className="font-semibold">{selectedIds.size}</span> clienti selezionati
            {totalCount > 0 && selectedIds.size < totalCount && (
              <>
                {" "}su {totalCount} filtrati
                {" · "}
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => selezionaTuttiFiltrati()}
                  disabled={loadingAllIds}
                >
                  {loadingAllIds ? "Caricamento…" : `Seleziona tutti i ${totalCount}`}
                </button>
              </>
            )}
            {selectedIds.size === totalCount && totalCount > 0 && (
              <span className="text-xs text-muted-foreground ml-2">(tutti i filtrati)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelectedIds(new Set())}
            >
              Deseleziona
            </button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Megaphone className="size-4" /> Avvia azione di recupero
            </Button>
          </div>
        </Card>
      )}

      {/* TABELLA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase text-foreground flex items-center gap-2">
            <FileText className="size-4" /> Clienti con scadenze aperte ({totalCount})
          </h2>
          <Button size="sm" variant="outline" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5">
            <Mail className="size-4" /> Invio massivo solleciti
          </Button>
        </div>
        {isLoading && pageRows.length === 0 ? <Skeleton className="h-40" /> : pageRows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessun cliente con scadenze aperte</Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Seleziona pagina"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.cliente_id))}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        if (v) pageRows.forEach((r) => next.add(r.cliente_id));
                        else pageRows.forEach((r) => next.delete(r.cliente_id));
                        setSelectedIds(next);
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-8 text-center px-1">Az.</TableHead>
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
                {pageRows.map((r) => {
                  const totScad = Number(r.tot_scaduto ?? 0);
                  const totAScad = Number(r.tot_a_scadere ?? 0);
                  const fattCur = Number(r.fatturato_cur ?? 0);
                  const fattPrev = Number(r.fatturato_prec ?? 0);
                  const isExpanded = expandedClienteId === r.cliente_id;
                  const isSel = selectedIds.has(r.cliente_id);
                  return (
                    <Fragment key={r.cliente_id}>
                      <TableRow
                        className={`cursor-pointer ${r.bloccato ? "bg-destructive/10 hover:bg-destructive/15" : r.in_gestione_legale ? "bg-amber-500/10 hover:bg-amber-500/15" : ""}`}
                        onClick={() => setExpandedClienteId(isExpanded ? null : r.cliente_id)}
                      >
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label="Seleziona cliente"
                            checked={isSel}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedIds);
                              if (v) next.add(r.cliente_id);
                              else next.delete(r.cliente_id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <AvvisatoIcon
                            info={r.avvisato_n > 0 ? {
                              cliente_id: r.cliente_id,
                              n_azioni: r.avvisato_n,
                              ha_email: r.avvisato_ha_email,
                              ultima_tipo: r.avvisato_ultima_tipo,
                              ultima_data: r.avvisato_ultima_data,
                            } : null}
                            onClick={() => navigate({
                              to: "/clienti/$clienteId",
                              params: { clienteId: r.cliente_id },
                              search: { tab: "attivita" } as never,
                            })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.ragione_sociale}</span>
                            {totScad < 0 && (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">A credito</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.codice_gestionale ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.store_nome ?? "—"}</TableCell>
                        <TableCell>{blockBadge(r)}</TableCell>
                        <TableCell>{legaleBadge(r)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fattCur > 0 ? fmtEuro(fattCur) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fattPrev > 0 ? fmtEuro(fattPrev) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.n_scadute || "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${totScad < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                          {totScad !== 0 ? fmtEuro(totScad) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.n_a_scadere || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {totAScad > 0 ? fmtEuro(totAScad) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(r.prossima_scadenza)}</TableCell>
                        <TableCell>{fasciaBadge(r.fascia)}</TableCell>
                        <TableCell className="w-8 text-muted-foreground">
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${r.cliente_id}-exp`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={16} className="px-4 py-3">
                            <ExpandedRischioPanel
                              loading={loadingRischio}
                              data={rischioExpanded}
                              onApri={(e: React.MouseEvent) => { e.stopPropagation(); apriCliente(r.cliente_id); }}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>

            {/* Paginazione */}
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <div className="text-muted-foreground">
                Pagina <span className="font-medium text-foreground">{page}</span> di {totalPages}
                {" · "}{totalCount} clienti
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="size-4" /> Precedente
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Successiva <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </section>

      <AzioneRecuperoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedRows={pageRows
          .filter((r) => selectedIds.has(r.cliente_id))
          .map((r) => ({
            cliente: {
              id: r.cliente_id,
              ragione_sociale: r.ragione_sociale,
              codice_gestionale: r.codice_gestionale,
              store_id: r.store_id,
              bloccato: r.bloccato,
              ind_blocco: r.ind_blocco,
              in_gestione_legale: r.in_gestione_legale,
            },
            totScad: Number(r.tot_scaduto ?? 0),
            scaduteIds: r.scadute_ids ?? [],
          }))}
        userId={user?.id ?? null}
        onDone={() => { setSelectedIds(new Set()); setDialogOpen(false); }}
      />

      <InvioMassivoDialog
        open={invioMassivoOpen}
        onOpenChange={setInvioMassivoOpen}
        clienteIdsSelezionati={pageRows.filter((r) => selectedIds.has(r.cliente_id)).map((r) => r.cliente_id)}
        clienteIdsFiltrati={pageRows.map((r) => r.cliente_id)}
      />
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone, sublabel, tooltip }: { label: string; value: string; icon: typeof FileText; tone: "destructive" | "info" | "warning" | "default"; sublabel?: string; tooltip?: string }) {
  const cls = tone === "destructive" ? "bg-destructive/10 text-destructive"
    : tone === "info" ? "bg-primary/10 text-primary"
    : tone === "warning" ? "bg-orange-500/10 text-orange-600"
    : "bg-muted text-foreground";
  return (
    <Card className="p-4" title={tooltip}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
          {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sublabel}</p>}
        </div>
        <div className={`size-9 rounded-lg flex items-center justify-center ${cls} shrink-0 ml-2`}><Icon className="size-4" /></div>
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

type AvvisatoInfo = {
  cliente_id: string;
  n_azioni: number;
  ha_email: boolean;
  ultima_tipo: string | null;
  ultima_data: string | null;
} | null;

function AvvisatoIcon({ info, onClick }: { info: AvvisatoInfo; onClick: () => void }) {
  const attivo = !!info && info.n_azioni > 0;
  if (!attivo) return null;

  const haEmail = info!.ha_email;
  const Icon = haEmail ? Mail : Bell;
  const colorClass = haEmail ? "text-teal-600" : "text-amber-500";
  const tooltip = `${info!.n_azioni} azion${info!.n_azioni === 1 ? "e" : "i"} sullo scaduto attuale${info!.ultima_tipo ? ` — ultima: ${info!.ultima_tipo}${info!.ultima_data ? " " + fmtDate(info!.ultima_data) : ""}` : ""}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={tooltip}
            className={`inline-flex items-center justify-center rounded p-1 hover:bg-muted transition-colors ${colorClass}`}
          >
            <Icon className="size-5" strokeWidth={2.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

type SelRow = { cliente: Cliente; totScad: number; scaduteIds: string[] };

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AzioneRecuperoDialog({
  open, onOpenChange, selectedRows, userId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRows: SelRow[];
  userId: string | null;
  onDone: () => void;
}) {
  const [tipo, setTipo] = useState<"email" | "telefonata" | "promemoria">("telefonata");
  const [dataAzione, setDataAzione] = useState<string>(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("telefonata");
      setDataAzione(toLocalInputValue(new Date()));
      setNote("");
    }
  }, [open]);

  const totaleScaduto = useMemo(
    () => selectedRows.reduce((a, r) => a + Number(r.totScad ?? 0), 0),
    [selectedRows],
  );

  async function handleConfirm() {
    if (!userId) {
      toast.error("Utente non autenticato");
      return;
    }
    if (selectedRows.length === 0) return;
    setSaving(true);
    try {
      const iso = new Date(dataAzione).toISOString();
      const azioniPayload = selectedRows.map((r) => ({
        cliente_id: r.cliente.id,
        operatore_id: userId,
        tipo,
        esito: "da_fare" as const,
        data_azione: iso,
        note: note.trim() || null,
        importo_riferimento: r.totScad || null,
      }));
      const { data: inserted, error: errAz } = await supabase
        .from("azioni_recupero")
        .insert(azioniPayload)
        .select("id, cliente_id");
      if (errAz) throw errAz;

      const azById = new Map<string, string>();
      (inserted ?? []).forEach((a) => azById.set(a.cliente_id as string, a.id as string));

      const ponti: { azione_id: string; scadenza_id: string }[] = [];
      for (const r of selectedRows) {
        const azId = azById.get(r.cliente.id);
        if (!azId) continue;
        for (const sid of r.scaduteIds) {
          ponti.push({ azione_id: azId, scadenza_id: sid });
        }
      }
      if (ponti.length > 0) {
        const { error: errPonti } = await supabase.from("azioni_recupero_scadenze").insert(ponti);
        if (errPonti) throw errPonti;
      }

      toast.success(`Create ${inserted?.length ?? 0} azioni di recupero`);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore durante la creazione delle azioni";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Avvia azione di recupero</DialogTitle>
          <DialogDescription>
            {selectedRows.length} clienti selezionati · Totale scaduto {fmtEuro(totaleScaduto)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo azione</Label>
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)} className="grid grid-cols-3 gap-2">
              {(["email", "telefonata", "promemoria"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm capitalize ${tipo === t ? "border-primary bg-primary/5" : ""}`}
                >
                  <RadioGroupItem value={t} />
                  {t}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-azione">Data azione</Label>
            <Input
              id="data-azione"
              type="datetime-local"
              value={dataAzione}
              onChange={(e) => setDataAzione(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note-azione">Note (opzionale)</Label>
            <Textarea
              id="note-azione"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>

          {tipo === "email" && (
            <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 p-3">
              L'invio email verrà collegato in un secondo momento; ora viene registrata solo l'azione.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleConfirm} disabled={saving || selectedRows.length === 0}>
            {saving ? "Creazione…" : "Conferma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
