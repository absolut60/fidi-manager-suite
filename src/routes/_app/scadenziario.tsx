import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, FileText, Ban, CalendarClock, Scale, ChevronDown, ChevronUp, Megaphone, Mail, Bell, MailOpen } from "lucide-react";
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
import { classificaScadenza } from "@/lib/scadenze";
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

type ScadRow = {
  id: string;
  cliente_id: string;
  importo_scadenza: number | null;
  giorni_ritardo: number | null;
  data_scadenza: string | null;
  stato_contabile: string | null;
  tempi_scadenza: string | null;
  data_pagamento_effettiva: string | null;
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
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);

  // Reset selection on filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [storeId, fascia, importoMin, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, mostraACredito]);

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
    queryKey: ["scadenze-globali-v5-aperte"],
    queryFn: async () => {
      const all: ScadRow[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        // Regola unica: una scadenza e' "attiva" (scaduta o a scadere) se
        // ha stato_contabile='Aperta' e nessuna data di pagamento effettiva.
        // tempi_scadenza nel nuovo tracciato e' solo fascia di anzianita',
        // non e' affidabile per decidere lo stato.
        const { data, error } = await supabase
          .from("scadenze")
          .select("id, cliente_id, importo_scadenza, giorni_ritardo, data_scadenza, stato_contabile, tempi_scadenza, data_pagamento_effettiva, codice_pagamento")
          .eq("stato_contabile", "Aperta")
          .order("cliente_id", { ascending: true })
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
      // RPC server-side: una riga per cliente con scadenze aperte, con cur/prev
      // gia' aggregati. Evita il troncamento a 1000 righe di PostgREST che
      // affliggeva la lettura diretta della view fatturato_clienti.
      const { data, error } = await supabase.rpc(
        "get_fatturato_clienti_scadenziario" as never,
        { _anno_corrente: annoCorrente, _anno_prec: annoPrec } as never,
      );
      if (error) throw error;
      const m = new Map<string, { cur: number; prev: number }>();
      for (const r of (data ?? []) as unknown as Array<{
        cliente_id: string | null;
        fatturato_anno_corrente: number | string | null;
        fatturato_anno_prec: number | string | null;
      }>) {
        if (!r.cliente_id) continue;
        m.set(r.cliente_id, {
          cur: Number(r.fatturato_anno_corrente) || 0,
          prev: Number(r.fatturato_anno_prec) || 0,
        });
      }
      return m;
    },
    staleTime: 60_000,
  });

  type AvvisatoRow = {
    cliente_id: string;
    n_azioni: number;
    ha_email: boolean;
    ultima_tipo: string | null;
    ultima_data: string | null;
  };
  const { data: avvisatiMap } = useQuery({
    queryKey: ["clienti-avvisati"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_clienti_avvisati" as never);
      if (error) throw error;
      const m = new Map<string, AvvisatoRow>();
      for (const r of (data ?? []) as unknown as AvvisatoRow[]) {
        m.set(r.cliente_id, r);
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
        return d >= today;
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
        scaduteIds: e.scadute.map((r) => r.id),
      };
    }).filter((r) => r.nScadute > 0);
    return out
      .filter((r) => {
        // Toggle "a credito" SPENTO: comportamento attuale (solo saldi positivi >= minImp)
        // ACCESO: includi anche r.totScad < 0, applicando minImp in valore assoluto
        if (r.totScad >= 0) return r.totScad >= minImp;
        if (!mostraACredito) return false;
        return Math.abs(r.totScad) >= minImp;
      })
      .filter((r) => {
        if (fascia === "tutte") return true;
        if (r.nScadute === 0) return false;
        return r.fascia === fascia;
      })
      .filter((r) => {
        if (avvisatoFilter === "tutti") return true;
        const a = avvisatiMap?.get(r.cliente.id);
        const avvisato = !!a && a.n_azioni > 0;
        return avvisatoFilter === "con_azioni" ? avvisato : !avvisato;
      })
      .sort((a, b) => {
        // Debitori prima (positivi desc), clienti a credito in fondo (più negativo prima)
        if (a.totScad >= 0 && b.totScad < 0) return -1;
        if (a.totScad < 0 && b.totScad >= 0) return 1;
        if (a.totScad < 0 && b.totScad < 0) return a.totScad - b.totScad;
        return b.totScad - a.totScad;
      });
  }, [aggregato, minImp, fascia, today, avvisatoFilter, avvisatiMap, mostraACredito]);

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
    let nCrediti = 0, totCrediti = 0;
    rows.forEach((r) => {
      // Totali scaduto: SOLO saldi positivi, per non sottostimare l'esposizione reale
      if (r.totScad > 0) {
        totScad += r.totScad;
        clientiScad += 1;
      } else if (r.totScad < 0) {
        nCrediti += 1;
        totCrediti += r.totScad;
      }
      totAScad += r.totAScad;
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
    return { totScad, totAScad, clientiScad, bloccati, inLegale: legaleIds.size, nCrediti, totCrediti };
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* TABELLA UNICA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase text-foreground flex items-center gap-2">
            <FileText className="size-4" /> Clienti con scadenze aperte ({rows.length})
          </h2>
          <Button size="sm" variant="outline" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5">
            <Mail className="size-4" /> Invio massivo solleciti
          </Button>
        </div>
        {isLoading ? <Skeleton className="h-40" /> : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessun cliente con scadenze aperte</Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Seleziona pagina"
                      checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.cliente.id))}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        if (v) rows.forEach((r) => next.add(r.cliente.id));
                        else rows.forEach((r) => next.delete(r.cliente.id));
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
                {rows.map((r) => {
                  const storeName = stores?.find((s) => s.id === r.cliente.store_id)?.nome ?? "—";
                  const fatt = fatturatoMap?.get(r.cliente.id);
                  const isExpanded = expandedClienteId === r.cliente.id;
                  const isSel = selectedIds.has(r.cliente.id);
                  return (
                    <Fragment key={r.cliente.id}>
                      <TableRow
                        key={r.cliente.id}
                        className={`cursor-pointer ${r.cliente.bloccato ? "bg-destructive/10 hover:bg-destructive/15" : r.cliente.in_gestione_legale ? "bg-amber-500/10 hover:bg-amber-500/15" : ""}`}
                        onClick={() => setExpandedClienteId(isExpanded ? null : r.cliente.id)}
                      >
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label="Seleziona cliente"
                            checked={isSel}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedIds);
                              if (v) next.add(r.cliente.id);
                              else next.delete(r.cliente.id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <AvvisatoIcon
                            info={avvisatiMap?.get(r.cliente.id) ?? null}
                            onClick={() => navigate({
                              to: "/clienti/$clienteId",
                              params: { clienteId: r.cliente.id },
                              search: { tab: "attivita" } as never,
                            })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.cliente.ragione_sociale}</span>
                            {r.totScad < 0 && (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">A credito</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.cliente.codice_gestionale ?? "—"}</TableCell>
                        <TableCell className="text-xs">{storeName}</TableCell>
                        <TableCell>{blockBadge(r.cliente)}</TableCell>
                        <TableCell>{legaleBadge(r.cliente)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fatt && fatt.cur > 0 ? fmtEuro(fatt.cur) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fatt && fatt.prev > 0 ? fmtEuro(fatt.prev) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.nScadute || "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${r.totScad < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                          {r.totScad !== 0 ? fmtEuro(r.totScad) : "—"}
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
                          <TableCell colSpan={16} className="px-4 py-3">
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

      <AzioneRecuperoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedRows={rows.filter((r) => selectedIds.has(r.cliente.id))}
        userId={user?.id ?? null}
        onDone={() => { setSelectedIds(new Set()); setDialogOpen(false); }}
      />

      <InvioMassivoDialog
        open={invioMassivoOpen}
        onOpenChange={setInvioMassivoOpen}
        clienteIdsSelezionati={rows.filter((r) => selectedIds.has(r.cliente.id)).map((r) => r.cliente.id)}
        clienteIdsFiltrati={rows.map((r) => r.cliente.id)}
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
