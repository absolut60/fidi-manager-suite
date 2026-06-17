import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, Building, MapPin, FileCheck2, FileX2, ArrowLeft, ArrowRight, Check, Pencil, PenTool, FileText, SlidersHorizontal, X, AlertCircle, Clock, CheckCircle2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import * as RadixSlider from "@radix-ui/react-slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { generaSchedaCliente } from "@/lib/scheda-pdf";
import { useAuth } from "@/hooks/use-auth";
import { useConfig, isClienteAttivo } from "@/hooks/use-config";
import { CondizionePagamentoSelect } from "@/components/condizione-pagamento-select";
import { CategoriaSelect } from "@/components/categoria-select";

export const Route = createFileRoute("/_app/clienti")({
  component: ClientiPage,
});

type SemaforoColor = "rosso" | "arancione" | "giallo" | "verde";

function calcSemaforo(c: {
  fido_residuo?: number | null;
  fido_gestionale?: number | null;
  scaduto?: number | null;
}): SemaforoColor {
  const residuo = c.fido_residuo == null ? null : Number(c.fido_residuo);
  const fidoGest = c.fido_gestionale == null ? null : Number(c.fido_gestionale);
  const scaduto = c.scaduto == null ? null : Number(c.scaduto);
  if (residuo != null && residuo < 0) return "rosso";
  if (residuo != null && fidoGest != null && fidoGest > 0 && residuo < fidoGest * 0.1) return "arancione";
  if (scaduto != null && scaduto > 0) return "giallo";
  return "verde";
}

const SEMAFORO_DOT: Record<SemaforoColor, string> = {
  rosso: "bg-destructive",
  arancione: "bg-orange-500",
  giallo: "bg-yellow-500",
  verde: "bg-success",
};

const SEMAFORO_LABEL: Record<SemaforoColor, string> = {
  rosso: "Rischio critico",
  arancione: "Fido quasi esaurito",
  giallo: "Scaduto presente",
  verde: "Posizione regolare",
};

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

type ScadenziarioState = {
  totale_scaduto: number;
  totale_a_scadere: number;
  ha_scaduto: boolean;
  ha_a_scadere: boolean;
};

// Calcolo "Fido proposto" per la proposta massiva.
// NOTA: implementazione provvisoria — verrà sostituita con un algoritmo più
// sofisticato. Mantieni questa funzione isolata per facilitare l'aggiornamento.
function calcolaFidoProposto(cliente: any): number {
  const esposizione = Number(cliente?.totale_rischio ?? 0);
  if (!Number.isFinite(esposizione) || esposizione <= 0) return 0;
  return Math.ceil(esposizione / 500) * 500;
}

function determinaTipoRichiesta(
  fidoAttuale: number,
  fidoProposto: number,
): "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo" {
  if (!fidoAttuale || fidoAttuale === 0) return "nuovo_fido";
  if (fidoProposto > fidoAttuale) return "aumento";
  if (fidoProposto < fidoAttuale) return "diminuzione";
  return "rinnovo";
}

const FIDO_RANGE_MIN = -100000;
const FIDO_RANGE_MAX = 500000;

function SearchInput({
  value,
  onChange,
  placeholder = "Cerca ragione sociale, P.IVA, cod. gest., città...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

function ClientiPage() {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isListRoute = currentPath === "/clienti";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [statoCliente, setStatoCliente] = useState<"attivi" | "disattivati" | "tutti">("attivi");
  const [statoAttivita, setStatoAttivita] = useState<"tutti" | "attivi" | "non_attivi">("attivi");
  const { role: _roleEarly, profilo: _profiloEarly } = useAuth();
  const isStoreManager = _roleEarly === "store_manager";
  const config = useConfig();
  const myStoreId = _profiloEarly?.store_id ?? null;
  const [storeFiltro, setStoreFiltro] = useState<string>(
    isStoreManager && myStoreId ? myStoreId : "tutti"
  );
  const [statoFido, setStatoFido] = useState<Set<string>>(new Set());
  const [semaforoFiltro, setSemaforoFiltro] = useState<string>("tutti");
  const [filtroBlocco, setFiltroBlocco] = useState<"tutti" | "bloccati" | "non_bloccati">("tutti");
  const [privacyFiltro, setPrivacyFiltro] = useState<string>("tutti");
  const [filtroAssic, setFiltroAssic] = useState<"tutti" | "assicurati" | "non_assicurati">("tutti");
  const [filtroLegale, setFiltroLegale] = useState<"tutti" | "in_legale" | "non_in_legale">("tutti");
  const [filtroTipoSoggetto, setFiltroTipoSoggetto] = useState<"tutti" | "fisica" | "giuridica">("tutti");
  const [scadenziarioFiltro, setScadenziarioFiltro] = useState<string>("tutti");
  const [totaleRischioFiltro, setTotaleRischioFiltro] = useState<string>("tutti");
  const [fatturatoFiltro, setFatturatoFiltro] = useState<string>("tutti");
  const [aScadereFiltro, setAScadereFiltro] = useState<string>("tutti");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("ragione_sociale");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filtro Fido residuo (fascia + range slider, cumulativi)
  const [fidoFascia, setFidoFascia] = useState<string>("tutti");
  const [sliderDisplay, setSliderDisplay] = useState<[number, number]>([FIDO_RANGE_MIN, FIDO_RANGE_MAX]);
  const [sliderCommitted, setSliderCommitted] = useState<[number, number]>([FIDO_RANGE_MIN, FIDO_RANGE_MAX]);

  // === Filtri avanzati (modal) — APPLIED state (commit dopo "Applica") ===
  type AdvOp = "none" | "lt" | "lte" | "gt" | "eq" | "between";
  type AdvApplied = {
    fidoOp: AdvOp; fidoVal: number | null; fidoFrom: number | null; fidoTo: number | null;
    percConsumato: number | null;
    dataFattPrima: string; dataFattDopo: string;
    presetScopertoInsoluto: boolean;
  };
  const ADV_EMPTY: AdvApplied = {
    fidoOp: "none", fidoVal: null, fidoFrom: null, fidoTo: null,
    percConsumato: null, dataFattPrima: "", dataFattDopo: "",
    presetScopertoInsoluto: false,
  };
  const [advApplied, setAdvApplied] = useState<AdvApplied>(ADV_EMPTY);
  const [advOpen, setAdvOpen] = useState(false);




  // Selezione multipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Map<string, any>>(new Map());
  const [massivoOpen, setMassivoOpen] = useState(false);
  const { user } = useAuth();

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });

  // Aggregato scadenziario (una sola query, cached) per badge + filtro
  const { data: scadenziarioMap } = useQuery({
    queryKey: ["clienti-scadenziario-agg"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_clienti_scadenziario");
      if (error) throw error;
      const map = new Map<string, ScadenziarioState>();
      for (const r of (data ?? []) as any[]) {
        map.set(r.cliente_id, {
          totale_scaduto: Number(r.totale_scaduto) || 0,
          totale_a_scadere: Number(r.totale_a_scadere) || 0,
          ha_scaduto: !!r.ha_scaduto,
          ha_a_scadere: !!r.ha_a_scadere,
        });
      }
      return map;
    },
    staleTime: 60_000,
  });

  // Mappa classificazione (id + colonne necessarie per semaforo e stato fido)
  // Carica tutti i clienti in chunk da 1000 per superare il limite Supabase.
  const { data: classifList } = useQuery({
    queryKey: ["clienti-classificazione"],
    queryFn: async () => {
      const all: any[] = [];
      let offset = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("clienti")
          .select("id, bloccato, fido, fido_residuo, fido_gestionale, scaduto")
          .range(offset, offset + size - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < size) break;
        offset += size;
      }
      return all;
    },
    staleTime: 60_000,
  });

  // ID set per filtro scadenziario
  const scadenziarioIdsFilter = useMemo(() => {
    if (!scadenziarioMap || scadenziarioFiltro === "tutti") return null;
    const ids: string[] = [];
    if (scadenziarioFiltro === "scaduto") {
      for (const [id, s] of scadenziarioMap) if (s.ha_scaduto) ids.push(id);
    } else if (scadenziarioFiltro === "a_scadere") {
      for (const [id, s] of scadenziarioMap) if (s.ha_a_scadere && !s.ha_scaduto) ids.push(id);
    } else if (scadenziarioFiltro === "in_regola") {
      return { mode: "exclude" as const, ids: Array.from(scadenziarioMap.keys()) };
    }
    return { mode: "include" as const, ids };
  }, [scadenziarioMap, scadenziarioFiltro]);

  // ID set per filtro "A scadere" (scadenze aperte, non scadute, entro N giorni)
  const A_SCADERE_GIORNI: Record<string, number | null> = {
    tutti: null,
    "7": 7,
    "30": 30,
    "60": 60,
    "oltre60": -1, // marker: oltre 60 giorni
  };
  const { data: aScadereIds } = useQuery({
    queryKey: ["clienti-a-scadere-ids", aScadereFiltro],
    queryFn: async () => {
      if (aScadereFiltro === "tutti") return null;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const ids = new Set<string>();
      let off = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from("scadenze")
          .select("cliente_id, data_scadenza")
          .eq("stato_contabile", "Aperta")
          .eq("giorni_ritardo", 0)
          .gte("data_scadenza", todayStr);
        if (aScadereFiltro === "oltre60") {
          const d = new Date(today); d.setDate(d.getDate() + 60);
          q = q.gt("data_scadenza", d.toISOString().slice(0, 10));
        } else {
          const giorni = Number(aScadereFiltro);
          const d = new Date(today); d.setDate(d.getDate() + giorni);
          q = q.lte("data_scadenza", d.toISOString().slice(0, 10));
        }
        const { data, error } = await q.range(off, off + size - 1);
        if (error) throw error;
        const batch = (data ?? []) as any[];
        for (const r of batch) if (r.cliente_id) ids.add(r.cliente_id);
        if (batch.length < size) break;
        off += size;
        if (off > 50000) break;
      }
      return Array.from(ids);
    },
    enabled: aScadereFiltro !== "tutti",
    staleTime: 60_000,
  });

  // ID set per filtro fatturato anno corrente
  const annoCorrenteClienti = useMemo(() => new Date().getFullYear(), []);
  const { data: fatturatoIds } = useQuery({
    queryKey: ["clienti-fatturato-ids", fatturatoFiltro, annoCorrenteClienti],
    queryFn: async () => {
      if (fatturatoFiltro === "tutti") return null;
      // Carica tutto il fatturato dell'anno corrente
      const { data, error } = await supabase
        .from("fatturato_clienti")
        .select("cliente_id, fatturato")
        .eq("anno", annoCorrenteClienti);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ cliente_id: string | null; fatturato: number | null }>;
      const map = new Map<string, number>();
      for (const r of rows) {
        if (r.cliente_id) map.set(r.cliente_id, Number(r.fatturato) || 0);
      }
      // Per "nessuno" servono TUTTI gli id clienti escludendo quelli che hanno fatturato
      if (fatturatoFiltro === "nessuno") {
        const all: string[] = [];
        let off = 0;
        const size = 1000;
        while (true) {
          const { data: cli, error: e2 } = await supabase
            .from("clienti")
            .select("id")
            .range(off, off + size - 1);
          if (e2) throw e2;
          const batch = (cli ?? []) as Array<{ id: string }>;
          for (const c of batch) if (!map.has(c.id)) all.push(c.id);
          if (batch.length < size) break;
          off += size;
        }
        return all;
      }
      const inRange = (v: number) => {
        if (fatturatoFiltro === "0_10k") return v > 0 && v <= 10000;
        if (fatturatoFiltro === "10k_50k") return v > 10000 && v <= 50000;
        if (fatturatoFiltro === "50k_100k") return v > 50000 && v <= 100000;
        if (fatturatoFiltro === "oltre_100k") return v > 100000;
        return false;
      };
      const ids: string[] = [];
      for (const [id, v] of map) if (inRange(v)) ids.push(id);
      return ids;
    },
    enabled: fatturatoFiltro !== "tutti",
    staleTime: 60_000,
  });
  const semaforoIds = useMemo<string[] | null>(() => {
    if (semaforoFiltro === "tutti" || !classifList) return null;
    return classifList.filter((c: any) => calcSemaforo(c) === semaforoFiltro).map((c: any) => c.id);
  }, [classifList, semaforoFiltro]);

  // ID set per filtro stato fido (server-side via .in)
  const statoFidoIds = useMemo<string[] | null>(() => {
    if (statoFido.size === 0 || !classifList) return null;
    return classifList.filter((c: any) => {
      const fido = Number(c.fido ?? 0);
      const scaduto = Number(c.scaduto ?? 0);
      const matches = new Set<string>();
      if (c.bloccato) matches.add("sospeso");
      if (scaduto > 0) matches.add("scaduto");
      if (!fido) matches.add("non_assegnato");
      else if (!c.bloccato && scaduto === 0) matches.add("attivo");
      return Array.from(statoFido).some((s) => matches.has(s));
    }).map((c: any) => c.id);
  }, [classifList, statoFido]);

  // Filtro avanzato: percentuale fido consumato (>= X%) — client-side da classifList
  const percConsumatoIds = useMemo<string[] | null>(() => {
    if (advApplied.percConsumato == null || !classifList) return null;
    const threshold = advApplied.percConsumato / 100;
    return (classifList as any[]).filter((c) => {
      const fg = getFidoAttuale(c);
      if (!fg || fg <= 0) return false;
      const fr = Number(c.fido_residuo ?? 0);
      const consumed = (fg - fr) / fg;
      return consumed >= threshold;
    }).map((c) => c.id);
  }, [classifList, advApplied.percConsumato]);

  // Intersezione id set "include" (semaforo ∩ stato_fido ∩ scadenziario ∩ a_scadere ∩ perc consumato)
  const includeIdsFilter = useMemo<string[] | null>(() => {
    const sources: string[][] = [];
    if (semaforoIds) sources.push(semaforoIds);
    if (statoFidoIds) sources.push(statoFidoIds);
    if (scadenziarioIdsFilter?.mode === "include") sources.push(scadenziarioIdsFilter.ids);
    if (aScadereIds) sources.push(aScadereIds);
    if (fatturatoIds) sources.push(fatturatoIds);
    if (percConsumatoIds) sources.push(percConsumatoIds);
    if (sources.length === 0) return null;
    const sets = sources.map((s) => new Set(s));
    return sources[0].filter((id) => sets.every((s) => s.has(id)));
  }, [semaforoIds, statoFidoIds, scadenziarioIdsFilter, aScadereIds, fatturatoIds, percConsumatoIds]);


  // Reset pagina ogni volta che cambia un filtro o l'ordinamento
  useEffect(() => {
    setPage(1);
  }, [search, statoCliente, statoAttivita, storeFiltro, statoFido, semaforoFiltro, filtroBlocco, privacyFiltro, filtroAssic, filtroLegale, filtroTipoSoggetto, scadenziarioFiltro, totaleRischioFiltro, aScadereFiltro, fatturatoFiltro, fidoFascia, sliderCommitted, pageSize, advApplied, sortBy, sortDir]);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Costruisce la query con TUTTI i filtri server-side (cumulativi AND, senza range di paginazione)
  function buildBaseQuery(selectCols: string, count: "exact" | undefined) {
    let q = supabase
      .from("clienti")
      .select(selectCols, count ? { count } : undefined);

    if (statoCliente === "attivi") q = q.eq("attivo", true);
    else if (statoCliente === "disattivati") q = q.eq("attivo", false);
    // Stessa regola della colonna "Stato" (isClienteAttivo, centralizzata in use-config):
    //   A) ultima_data_fatturazione >= {cutoff_cliente_attivo_anno}-01-01
    //   OPPURE
    //   B) doc_da_fatturare > 0  (DDT/documenti da fatturare aperti)
    // => Non attivo = NOT(A) AND NOT(B)
    if (statoAttivita === "attivi") {
      const cutoffIso = `${config.cutoff_cliente_attivo_anno}-01-01`;
      q = q.or(`ultima_data_fatturazione.gte.${cutoffIso},doc_da_fatturare.gt.0`);
    } else if (statoAttivita === "non_attivi") {
      const cutoffIso = `${config.cutoff_cliente_attivo_anno}-01-01`;
      // NOT A: ultima_data_fatturazione IS NULL OR < cutoff
      // AND NOT B: doc_da_fatturare IS NULL OR <= 0
      q = q
        .or(`ultima_data_fatturazione.is.null,ultima_data_fatturazione.lt.${cutoffIso}`)
        .or(`doc_da_fatturare.is.null,doc_da_fatturare.lte.0`);
    }
    if (storeFiltro !== "tutti") q = q.eq("store_id", storeFiltro);
    if (filtroBlocco === "bloccati") q = q.eq("bloccato", true);
    else if (filtroBlocco === "non_bloccati") q = q.eq("bloccato", false);
    if (privacyFiltro === "firmata") q = q.eq("privacy_firmata", true);
    else if (privacyFiltro === "da_firmare") q = q.eq("privacy_firmata", false);
    if (filtroAssic === "assicurati") q = q.eq("assicurazione_attiva", true);
    else if (filtroAssic === "non_assicurati") q = q.eq("assicurazione_attiva", false);
    if (filtroLegale === "in_legale") q = q.eq("in_gestione_legale", true);
    else if (filtroLegale === "non_in_legale") q = q.eq("in_gestione_legale", false);
    if (filtroTipoSoggetto === "fisica") q = q.eq("tipo_soggetto", "persona_fisica");
    else if (filtroTipoSoggetto === "giuridica") q = q.eq("tipo_soggetto", "azienda");

    // Fido residuo: fascia E range slider applicati insieme
    if (fidoFascia === "negativo") q = q.lt("fido_residuo", 0);
    else if (fidoFascia === "basso") q = q.gte("fido_residuo", 0).lte("fido_residuo", 5000);
    else if (fidoFascia === "medio") q = q.gt("fido_residuo", 5000).lte("fido_residuo", 20000);
    else if (fidoFascia === "alto") q = q.gt("fido_residuo", 20000);
    if (sliderCommitted[0] !== FIDO_RANGE_MIN) q = q.gte("fido_residuo", sliderCommitted[0]);
    if (sliderCommitted[1] !== FIDO_RANGE_MAX) q = q.lte("fido_residuo", sliderCommitted[1]);

    // Totale rischio (fasce)
    if (totaleRischioFiltro === "basso") q = q.gte("totale_rischio", 0).lte("totale_rischio", 10000);
    else if (totaleRischioFiltro === "medio") q = q.gt("totale_rischio", 10000).lte("totale_rischio", 50000);
    else if (totaleRischioFiltro === "alto") q = q.gt("totale_rischio", 50000).lte("totale_rischio", 100000);
    else if (totaleRischioFiltro === "molto_alto") q = q.gt("totale_rischio", 100000);

    // === Filtri avanzati ===
    if (advApplied.fidoOp === "lt" && advApplied.fidoVal != null) q = q.lt("fido_residuo", advApplied.fidoVal);
    else if (advApplied.fidoOp === "lte" && advApplied.fidoVal != null) q = q.lte("fido_residuo", advApplied.fidoVal);
    else if (advApplied.fidoOp === "gt" && advApplied.fidoVal != null) q = q.gt("fido_residuo", advApplied.fidoVal);
    else if (advApplied.fidoOp === "eq" && advApplied.fidoVal != null) q = q.eq("fido_residuo", advApplied.fidoVal);
    else if (advApplied.fidoOp === "between" && advApplied.fidoFrom != null && advApplied.fidoTo != null) {
      q = q.gte("fido_residuo", advApplied.fidoFrom).lte("fido_residuo", advApplied.fidoTo);
    }
    if (advApplied.dataFattPrima) q = q.lt("ultima_data_fatturazione", advApplied.dataFattPrima);
    if (advApplied.dataFattDopo) q = q.gt("ultima_data_fatturazione", advApplied.dataFattDopo);
    if (advApplied.presetScopertoInsoluto) q = q.eq("assicurazione_attiva", false).gt("scaduto", 0);

    // Include intersect (semaforo / stato fido / scadenziario include / a_scadere)
    if (includeIdsFilter) {
      if (includeIdsFilter.length === 0) return { empty: true as const };
      q = q.in("id", includeIdsFilter);
    }
    // Exclude scadenziario "in_regola"
    if (scadenziarioIdsFilter?.mode === "exclude" && scadenziarioIdsFilter.ids.length > 0) {
      q = q.not("id", "in", `(${scadenziarioIdsFilter.ids.join(",")})`);
    }

    const term = search.replace(/[(),]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(
        `ragione_sociale.ilike.${like},partita_iva.ilike.${like},codice_gestionale.ilike.${like},citta.ilike.${like}`,
      );
    }

    q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });
    return { q };
  }


  const classifReady = (semaforoFiltro === "tutti" && statoFido.size === 0) || !!classifList;
  const scadReady = scadenziarioFiltro === "tutti" || !!scadenziarioMap;

  const { data: clientiResp, isLoading } = useQuery({
    queryKey: ["clienti", { search, statoCliente, statoAttivita, storeFiltro, filtroBlocco, privacyFiltro, filtroAssic, filtroLegale, filtroTipoSoggetto, scadenziarioFiltro, semaforoFiltro, statoFidoArr: Array.from(statoFido).sort(), totaleRischioFiltro, aScadereFiltro, fatturatoFiltro, fidoFascia, sliderCommitted, page, pageSize, advApplied, sortBy, sortDir }],
    queryFn: async () => {
      const built = buildBaseQuery("*, stores(nome, codice)", "exact");
      if ("empty" in built) return { rows: [], count: 0 };
      const { data, error, count } = await built.q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? (data?.length ?? 0) };
    },
    enabled: isListRoute && scadReady && classifReady,
  });
  const clienti = (clientiResp?.rows ?? []) as any[];
  const totaleClienti = clientiResp?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totaleClienti / pageSize));

  // Fetch di tutti gli id filtrati (per "Seleziona tutti i filtrati")
  async function fetchAllFilteredRows(): Promise<any[]> {
    const built = buildBaseQuery("id, ragione_sociale, fido, totale_rischio", undefined);
    if ("empty" in built) return [];
    const all: any[] = [];
    let off = 0;
    const size = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await built.q.range(off, off + size - 1);
      if (error) throw error;
      const batch = (data ?? []) as any[];
      all.push(...batch);
      if (batch.length < size) break;
      off += size;
      if (off > 20000) break;
      const rebuilt = buildBaseQuery("id, ragione_sociale, fido, totale_rischio", undefined);
      if ("empty" in rebuilt) break;
      (built as any).q = rebuilt.q;
    }
    return all;
  }

  const attiviCount =
    (search ? 1 : 0) +
    (statoCliente !== "attivi" ? 1 : 0) +
    (statoAttivita !== "attivi" ? 1 : 0) +
    (storeFiltro !== "tutti" ? 1 : 0) +
    (statoFido.size > 0 ? 1 : 0) +
    (semaforoFiltro !== "tutti" ? 1 : 0) +
    (filtroBlocco !== "tutti" ? 1 : 0) +
    (privacyFiltro !== "tutti" ? 1 : 0) +
    (filtroAssic !== "tutti" ? 1 : 0) +
    (filtroLegale !== "tutti" ? 1 : 0) +
    (filtroTipoSoggetto !== "tutti" ? 1 : 0) +
    (scadenziarioFiltro !== "tutti" ? 1 : 0) +
    (totaleRischioFiltro !== "tutti" ? 1 : 0) +
    (aScadereFiltro !== "tutti" ? 1 : 0) +
    (fatturatoFiltro !== "tutti" ? 1 : 0) +
    (fidoFascia !== "tutti" ? 1 : 0) +
    ((sliderCommitted[0] !== FIDO_RANGE_MIN || sliderCommitted[1] !== FIDO_RANGE_MAX) ? 1 : 0);

  // Conteggio filtri avanzati attivi
  const advCount =
    (advApplied.fidoOp !== "none" ? 1 : 0) +
    (advApplied.percConsumato != null ? 1 : 0) +
    (advApplied.dataFattPrima ? 1 : 0) +
    (advApplied.dataFattDopo ? 1 : 0) +
    (advApplied.presetScopertoInsoluto ? 1 : 0);

  function resetFiltri() {
    setSearchInput(""); setSearch("");
    setStatoCliente("attivi");
    setStatoAttivita("attivi");
    setStoreFiltro("tutti");
    setStatoFido(new Set());
    setSemaforoFiltro("tutti");
    setFiltroBlocco("tutti");
    setPrivacyFiltro("tutti");
    setFiltroAssic("tutti");
    setFiltroLegale("tutti");
    setFiltroTipoSoggetto("tutti");
    setScadenziarioFiltro("tutti");
    setTotaleRischioFiltro("tutti");
    setAScadereFiltro("tutti");
    setFatturatoFiltro("tutti");
    setFidoFascia("tutti");
    setSliderDisplay([FIDO_RANGE_MIN, FIDO_RANGE_MAX]);
    setSliderCommitted([FIDO_RANGE_MIN, FIDO_RANGE_MAX]);
    setAdvApplied(ADV_EMPTY);
  }

  function toggleSort(colonna: string) {
    if (sortBy !== colonna) {
      setSortBy(colonna);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortBy("ragione_sociale");
      setSortDir("asc");
    }
  }


  // Selezione
  function toggleSelect(c: any) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  }
  const [loadingSelection, setLoadingSelection] = useState(false);
  function clearSelection() {
    setSelectedIds(new Set());
    setSelectedRows(new Map());
  }
  async function selezionaTuttiFiltrati() {
    setLoadingSelection(true);
    try {
      const all = await fetchAllFilteredRows();
      const ids = new Set(all.map((r) => r.id));
      const map = new Map<string, any>();
      for (const r of all) map.set(r.id, r);
      setSelectedIds(ids);
      setSelectedRows(map);
      toast.success(`${all.length} clienti selezionati`);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore nel recupero dei clienti filtrati");
    } finally {
      setLoadingSelection(false);
    }
  }


  const STATO_FIDO_OPTS: Array<{ value: string; label: string }> = [
    { value: "attivo", label: "Attivo" },
    { value: "scaduto", label: "Scaduto" },
    { value: "in_revisione", label: "In revisione" },
    { value: "sospeso", label: "Sospeso" },
    { value: "non_assegnato", label: "Non assegnato" },
  ];

  function toggleStatoFido(v: string) {
    setStatoFido((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  const StoreSelect = isStoreManager ? null : (
    <Select value={storeFiltro} onValueChange={setStoreFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Punto vendita" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti i punti vendita</SelectItem>
        {(stores ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const StatoFidoPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="truncate">
            {statoFido.size === 0 ? "Stato fido" : `Stato fido (${statoFido.size})`}
          </span>
          <SlidersHorizontal className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {STATO_FIDO_OPTS.map((o) => (
          <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={statoFido.has(o.value)} onCheckedChange={() => toggleStatoFido(o.value)} />
            {o.label}
          </label>
        ))}
        {statoFido.size > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => setStatoFido(new Set())}>
            Pulisci
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );

  const SemaforoSelect = (
    <Select value={semaforoFiltro} onValueChange={setSemaforoFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Semaforo" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti i semafori</SelectItem>
        <SelectItem value="verde">🟢 Verde</SelectItem>
        <SelectItem value="giallo">🟡 Giallo</SelectItem>
        <SelectItem value="arancione">🟠 Arancione</SelectItem>
        <SelectItem value="rosso">🔴 Rosso</SelectItem>
      </SelectContent>
    </Select>
  );

  const StatoAttivitaSelect = (
    <Select value={statoAttivita} onValueChange={(v) => setStatoAttivita(v as typeof statoAttivita)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Stato attività" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="attivi">Solo attivi</SelectItem>
        <SelectItem value="non_attivi">Solo non attivi</SelectItem>
        <SelectItem value="tutti">Tutti</SelectItem>
      </SelectContent>
    </Select>
  );

  const ScadenziarioSelect = (
    <Select value={scadenziarioFiltro} onValueChange={setScadenziarioFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Scadenziario" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Scadenziario: tutti</SelectItem>
        <SelectItem value="scaduto">Con scaduto</SelectItem>
        <SelectItem value="a_scadere">Solo a scadere</SelectItem>
        <SelectItem value="in_regola">Tutto in regola</SelectItem>
      </SelectContent>
    </Select>
  );

  const FidoFasciaSelect = (
    <Select value={fidoFascia} onValueChange={setFidoFascia}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Fido residuo" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Fido residuo: tutti</SelectItem>
        <SelectItem value="negativo">Negativo / Sforato (&lt; 0)</SelectItem>
        <SelectItem value="basso">Basso (0 – 5.000 €)</SelectItem>
        <SelectItem value="medio">Medio (5.000 – 20.000 €)</SelectItem>
        <SelectItem value="alto">Alto (oltre 20.000 €)</SelectItem>
      </SelectContent>
    </Select>
  );

  const TotaleRischioSelect = (
    <Select value={totaleRischioFiltro} onValueChange={setTotaleRischioFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Totale rischio" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Totale rischio: tutti</SelectItem>
        <SelectItem value="basso">Basso (0 – 10.000 €)</SelectItem>
        <SelectItem value="medio">Medio (10.001 – 50.000 €)</SelectItem>
        <SelectItem value="alto">Alto (50.001 – 100.000 €)</SelectItem>
        <SelectItem value="molto_alto">Molto alto (oltre 100.000 €)</SelectItem>
      </SelectContent>
    </Select>
  );

  const AScadereSelect = (
    <Select value={aScadereFiltro} onValueChange={setAScadereFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="A scadere" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">A scadere: tutti</SelectItem>
        <SelectItem value="7">Entro 7 giorni</SelectItem>
        <SelectItem value="30">Entro 30 giorni</SelectItem>
        <SelectItem value="60">Entro 60 giorni</SelectItem>
        <SelectItem value="oltre60">Oltre 60 giorni</SelectItem>
      </SelectContent>
    </Select>
  );

  const FatturatoSelect = (
    <Select value={fatturatoFiltro} onValueChange={setFatturatoFiltro}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Fatturato anno corrente (IVA escl.)" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Fatturato {annoCorrenteClienti} (IVA escl.): tutti</SelectItem>
        <SelectItem value="nessuno">Nessun fatturato (0 €)</SelectItem>
        <SelectItem value="0_10k">Fino a 10.000 €</SelectItem>
        <SelectItem value="10k_50k">10.001 – 50.000 €</SelectItem>
        <SelectItem value="50k_100k">50.001 – 100.000 €</SelectItem>
        <SelectItem value="oltre_100k">Oltre 100.000 €</SelectItem>
      </SelectContent>
    </Select>
  );

  const FidoRangeSlider = (
    <div className="space-y-2 px-1 py-2 border rounded-md">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-muted-foreground">Slider fido residuo:</span>
        <span>{fmtEuro(sliderDisplay[0])} <span className="text-muted-foreground">→</span> {fmtEuro(sliderDisplay[1])}</span>
      </div>
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={FIDO_RANGE_MIN}
        max={FIDO_RANGE_MAX}
        step={500}
        value={sliderDisplay}
        onValueChange={(v: number[]) => setSliderDisplay([v[0] ?? FIDO_RANGE_MIN, v[1] ?? FIDO_RANGE_MAX])}
        onValueCommit={(v: number[]) => setSliderCommitted([v[0] ?? FIDO_RANGE_MIN, v[1] ?? FIDO_RANGE_MAX])}
      >
        <RadixSlider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
          <RadixSlider.Range className="absolute h-full bg-primary" />
        </RadixSlider.Track>
        <RadixSlider.Thumb aria-label="Fido residuo minimo" className="block size-5 rounded-full border-2 border-primary bg-background shadow-sm outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        <RadixSlider.Thumb aria-label="Fido residuo massimo" className="block size-5 rounded-full border-2 border-primary bg-background shadow-sm outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
      </RadixSlider.Root>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{fmtEuro(FIDO_RANGE_MIN)}</span>
        <span>{fmtEuro(FIDO_RANGE_MAX)}</span>
      </div>
    </div>
  );

  const BloccoSelect = (
    <Select value={filtroBlocco} onValueChange={(v) => setFiltroBlocco(v as typeof filtroBlocco)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Stato blocco" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti</SelectItem>
        <SelectItem value="bloccati">Bloccati</SelectItem>
        <SelectItem value="non_bloccati">Non bloccati</SelectItem>
      </SelectContent>
    </Select>
  );

  const AssicSelect = (
    <Select value={filtroAssic} onValueChange={(v) => setFiltroAssic(v as typeof filtroAssic)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Assicurazione" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti</SelectItem>
        <SelectItem value="assicurati">Assicurati</SelectItem>
        <SelectItem value="non_assicurati">Non assicurati</SelectItem>
      </SelectContent>
    </Select>
  );

  const LegaleSelect = (
    <Select value={filtroLegale} onValueChange={(v) => setFiltroLegale(v as typeof filtroLegale)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Gestione legale" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti</SelectItem>
        <SelectItem value="in_legale">In gestione legale</SelectItem>
        <SelectItem value="non_in_legale">Non in gestione legale</SelectItem>
      </SelectContent>
    </Select>
  );

  const TipoSoggettoSelect = (
    <Select value={filtroTipoSoggetto} onValueChange={(v) => setFiltroTipoSoggetto(v as typeof filtroTipoSoggetto)}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Tipo soggetto" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="tutti">Tutti</SelectItem>
        <SelectItem value="fisica">Persona fisica</SelectItem>
        <SelectItem value="giuridica">Persona giuridica</SelectItem>
      </SelectContent>
    </Select>
  );

  function renderFiltriContent(stack = false) {
    if (stack) {
      return (
        <div className="grid grid-cols-1 gap-3">
          <SearchInput value={searchInput} onChange={setSearchInput} />
          {StoreSelect}
          {StatoFidoPopover}
          {SemaforoSelect}
          {ScadenziarioSelect}
          {FidoFasciaSelect}
          {TotaleRischioSelect}
          {AScadereSelect}
          {FidoRangeSlider}
          {BloccoSelect}
          {AssicSelect}
          {LegaleSelect}
          {TipoSoggettoSelect}
          {StatoAttivitaSelect}
          {attiviCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFiltri} className="gap-1 justify-start">
              <X className="size-4" /> Azzera tutti
            </Button>
          )}
        </div>
      );
    }
    const AdvFilterBtn = (
      <Button
        type="button"
        variant={advCount > 0 ? "default" : "outline"}
        size="sm"
        className="gap-1.5 h-9 text-[13px] w-full"
        onClick={() => setAdvOpen(true)}
      >
        <SlidersHorizontal className="size-4" />
        Filtri avanzati
        {advCount > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">{advCount}</Badge>
        )}
      </Button>
    );
    return (
      <div className="space-y-2 text-[13px]">
        {/* Riga 1: search + store + stato fido + semaforo */}
        <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-2">
          <SearchInput value={searchInput} onChange={setSearchInput} />
          {StoreSelect}
          {StatoFidoPopover}
          {SemaforoSelect}
        </div>
        {/* Riga 2: scadenziario / fido residuo / totale rischio / a scadere / fatturato / filtri avanzati */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {ScadenziarioSelect}
          {FidoFasciaSelect}
          {TotaleRischioSelect}
          {AScadereSelect}
          {FatturatoSelect}
          {AdvFilterBtn}
        </div>
        {/* Riga 3: stato attività + filtri a 3 stati */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="w-44">{StatoAttivitaSelect}</div>
          <div className="w-44">{BloccoSelect}</div>
          <div className="w-44">{AssicSelect}</div>
          <div className="w-44">{LegaleSelect}</div>
          <div className="w-44">{TipoSoggettoSelect}</div>
        </div>
        {/* Slider fido residuo: larghezza piena */}
        <div>{FidoRangeSlider}</div>
      </div>
    );
  }


  // Calcolo numeri pagina (max 5 visibili + ellipsis) — hook prima dell'early return
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);
      if (page <= 3) { start = 2; end = 4; }
      if (page >= totalPages - 2) { start = totalPages - 3; end = totalPages - 1; }
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  if (!isListRoute) {
    return <Outlet />;
  }

  function SortHeader({ col, label, align = "left" }: { col: string; label: string; align?: "left" | "right" }) {
    const active = sortBy === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 font-medium hover:text-primary transition-colors ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
        ) : (
          <ChevronsUpDown className="size-4 text-muted-foreground/60" />
        )}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anagrafica dei clienti dei punti vendita
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nuova scheda cliente
            </Button>
          </DialogTrigger>
          <SchedaClienteDialog onClose={() => { setOpen(false); setSearchInput(""); setSearch(""); }} />
        </Dialog>
      </div>

      <FiltriAvanzatiDialog
        open={advOpen}
        onOpenChange={setAdvOpen}
        applied={advApplied}
        onApply={(a) => { setAdvApplied(a); setAdvOpen(false); }}
        onReset={() => setAdvApplied(ADV_EMPTY)}
        onSetMainFiltro={(patch) => {
          if (patch.filtroBlocco !== undefined) setFiltroBlocco(patch.filtroBlocco);
          if (patch.filtroAssic !== undefined) setFiltroAssic(patch.filtroAssic);
          if (patch.scadenziarioFiltro !== undefined) setScadenziarioFiltro(patch.scadenziarioFiltro);
        }}
        currentMain={{ filtroBlocco, filtroAssic, scadenziarioFiltro }}
      />


      <Card className="p-4 sm:p-5">
        {/* Desktop: barra filtri (2 righe) con badge + reset in alto a destra */}
        <div className="hidden md:block mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-muted-foreground">Filtri</div>
            <div className="flex items-center gap-2">
              {attiviCount > 0 && (
                <Badge variant="secondary" className="h-6">{attiviCount} {attiviCount === 1 ? "filtro attivo" : "filtri attivi"}</Badge>
              )}
              {attiviCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFiltri} className="gap-1 h-7">
                  <X className="size-3.5" /> Azzera tutti
                </Button>
              )}
            </div>
          </div>
          {renderFiltriContent()}
        </div>


        {/* Mobile: search inline + bottone "Filtri" con badge */}
        <div className="md:hidden flex gap-2 mb-4">
          <div className="flex-1">
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Cerca cliente..." />
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-1.5 relative">
                <SlidersHorizontal className="size-4" />
                Filtri
                {attiviCount > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs">{attiviCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtri</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                {renderFiltriContent(true)}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="mb-3 text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Pagina <strong className="text-foreground">{page}</strong> di <strong className="text-foreground">{totalPages}</strong>
            <span className="ml-1">— <strong className="text-foreground">{totaleClienti}</strong> clienti totali</span>
          </span>
          {attiviCount > 0 && <span>(filtri attivi: {attiviCount})</span>}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs">Per pagina:</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>


        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : clienti.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Building className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessun cliente trovato</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Prova un'altra ricerca" : "Inizia compilando la prima scheda cliente"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={clienti.length > 0 && clienti.every((c: any) => selectedIds.has(c.id))}
                      onCheckedChange={async (v) => {
                        if (v) {
                          await selezionaTuttiFiltrati();
                        } else {
                          clearSelection();
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead><SortHeader col="ragione_sociale" label="Ragione sociale" /></TableHead>
                  <TableHead><SortHeader col="codice_gestionale" label="Cod. gest." /></TableHead>
                  <TableHead><SortHeader col="partita_iva" label="P. IVA" /></TableHead>
                  <TableHead><SortHeader col="citta" label="Città" /></TableHead>
                  <TableHead>Punto vendita</TableHead>
                  <TableHead className="text-right"><SortHeader col="fido_gestionale" label="Fido attuale" align="right" /></TableHead>
                  <TableHead className="text-right"><SortHeader col="fido_residuo" label="Fido residuo" align="right" /></TableHead>
                  <TableHead>Scadenziario</TableHead>
                  <TableHead>Privacy</TableHead>
                  <TableHead>Assic.</TableHead>
                  <TableHead>Stato</TableHead>

                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clienti.map((c: any) => {
                  const sem = calcSemaforo(c);
                  const residuo = c.fido_residuo;
                  const residuoNum = residuo == null ? null : Number(residuo);
                  const sc = scadenziarioMap?.get(c.id);
                  const isBlocked = !!c.bloccato || Number(c.ind_blocco ?? 0) > 0;
                  return (
                   <TableRow
                     key={c.id}
                     className={`cursor-pointer hover:bg-muted/50 ${!isClienteAttivo((c as any).ultima_data_fatturazione, (c as any).doc_da_fatturare, config) ? "bg-muted/40 text-muted-foreground" : ""} ${isBlocked ? "bg-[#FEF2F2] dark:bg-destructive/10 border-l-[3px] border-l-[#EF4444] hover:bg-[#FEE2E2] dark:hover:bg-destructive/15" : ""}`}
                     onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: c.id } })}
                   >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleSelect(c)}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block size-2.5 rounded-full ${SEMAFORO_DOT[sem]}`}
                        title={SEMAFORO_LABEL[sem]}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {(c as { in_gestione_legale?: boolean }).in_gestione_legale && (
                          <span title="In gestione legale" className="text-orange-600">⚖</span>
                        )}
                        {c.ragione_sociale}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {c.codice_gestionale || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.partita_iva || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.citta ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 text-muted-foreground" />
                          {c.citta} {c.provincia ? `(${c.provincia})` : ""}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.stores?.nome || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtEuro(c.fido_gestionale)}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${residuoNum != null && residuoNum < 0 ? "text-destructive" : ""}`}>
                      {fmtEuro(residuo)}
                    </TableCell>
                    <TableCell>
                      {!sc ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : sc.ha_scaduto ? (
                        <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20 gap-1" title="Importo scaduto">
                          <AlertCircle className="size-3" /> {fmtEuro(sc.totale_scaduto)}
                        </Badge>
                      ) : sc.ha_a_scadere ? (
                        <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-500/20 gap-1" title="A scadere">
                          <Clock className="size-3" /> {fmtEuro(sc.totale_a_scadere)}
                        </Badge>
                      ) : (
                        <Badge className="bg-success/15 text-success hover:bg-success/20 gap-1" title="Tutto pagato">
                          <CheckCircle2 className="size-3" /> In regola
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.privacy_firmata ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/20 gap-1">
                          <FileCheck2 className="size-3" /> Firmata
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <FileX2 className="size-3" /> Da firmare
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.assicurazione_attiva ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/20">POUEY</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>

                     <TableCell>
                       <div className="flex flex-col gap-1 items-start">
                         <Badge variant={!isClienteAttivo((c as any).ultima_data_fatturazione, (c as any).doc_da_fatturare, config) ? "secondary" : "default"}>
                           {!isClienteAttivo((c as any).ultima_data_fatturazione, (c as any).doc_da_fatturare, config) ? "Non attivo" : "Attivo"}
                         </Badge>
                         {c.ind_blocco === 1 && (
                           <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-500/20" title="Blocco con possibilità di sblocco">
                             Blocco revocabile
                           </Badge>
                         )}
                          {c.ind_blocco === 2 && (
                            <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20" title="Bloccato">
                              Bloccato
                            </Badge>
                          )}
                          {(c as { in_gestione_legale?: boolean }).in_gestione_legale && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-500 hover:bg-amber-500/20" title="In gestione legale">
                              ⚖️ Legale
                            </Badge>
                          )}
                       </div>
                     </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifica"
                        onClick={() => navigate({
                          to: "/clienti/$clienteId",
                          params: { clienteId: c.id },
                          search: { edit: 1 } as any,
                        })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
             </Table>
          </div>
        )}

        {/* Paginazione */}
        {totaleClienti > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Risultati {from + 1}–{Math.min(to + 1, totaleClienti)} di {totaleClienti}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="size-4" /> Precedente
              </Button>
              {pageNumbers.map((p, idx) =>
                p === "..." ? (
                  <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="min-w-9"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="gap-1"
              >
                Successivo <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Barra azione selezione */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border shadow-lg rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{selectedIds.size} clienti selezionati</span>
            {typeof totaleClienti === "number" && selectedIds.size < totaleClienti && (
              <button
                type="button"
                className="text-xs text-primary hover:underline text-left"
                onClick={selezionaTuttiFiltrati}
                disabled={loadingSelection}
              >
                Seleziona tutti i {totaleClienti} filtrati
              </button>
            )}
          </div>
          {loadingSelection && <span className="text-xs text-muted-foreground">Caricamento...</span>}
          <Button size="sm" onClick={() => setMassivoOpen(true)}>
            Proponi fido massivo
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Deseleziona tutto
          </Button>
        </div>
      )}

      <ProposteFidoMassivoDialog
        open={massivoOpen}
        onOpenChange={setMassivoOpen}
        selectedRows={Array.from(selectedRows.values())}
        userId={user?.id ?? null}
        onSuccess={() => {
          clearSelection();
          setMassivoOpen(false);
        }}
        onRemove={(id) => {
          setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
          setSelectedRows((prev) => { const n = new Map(prev); n.delete(id); return n; });
        }}
      />
    </div>
  );
}

// ============================================================================
// Dialog "Proposta fido massiva"
// ============================================================================

type RigaProposta = {
  cliente_id: string;
  ragione_sociale: string;
  fido_attuale: number;
  esposizione: number;
  fido_proposto: number;
  tipo: "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo";
  // Override motivazione per-riga. undefined = eredita la motivazione generale.
  motivazione?: string;
};

const MOTIVAZIONE_DEFAULT = "Revisione fido massiva";

function ProposteFidoMassivoDialog({
  open, onOpenChange, selectedRows, userId, onSuccess, onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRows: any[];
  userId: string | null;
  onSuccess: () => void;
  onRemove: (id: string) => void;
}) {
  const [modalitaInvio, setModalitaInvio] = useState<"bozza" | "invia">("bozza");
  const [tipoForzato, setTipoForzato] = useState<"auto" | "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo">("auto");
  const [motivazioneGenerale, setMotivazioneGenerale] = useState<string>(MOTIVAZIONE_DEFAULT);
  const [righe, setRighe] = useState<RigaProposta[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Inizializza/aggiorna righe quando cambia la selezione o si apre
  useEffect(() => {
    if (!open) return;
    setRighe((prev) => {
      const prevMap = new Map(prev.map((r) => [r.cliente_id, r]));
      return selectedRows.map((c) => {
        const existing = prevMap.get(c.id);
        if (existing) return existing;
        const proposto = calcolaFidoProposto(c);
        // Fido di riferimento = unico helper getFidoAttuale (centralizzato in
        // src/lib/fido-cliente.ts) cosi' che lista, scheda cliente, form
        // singolo e proposta massiva mostrino sempre lo stesso valore.
        const attuale = getFidoAttuale(c);

        return {
          cliente_id: c.id,
          ragione_sociale: c.ragione_sociale,
          fido_attuale: attuale,
          esposizione: Number(c.totale_rischio ?? 0),
          fido_proposto: proposto,
          tipo: determinaTipoRichiesta(attuale, proposto),
        };
      });
    });
  }, [open, selectedRows]);

  function aggiornaImporto(id: string, valore: number) {
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? {
      ...r,
      fido_proposto: valore,
      tipo: tipoForzato === "auto" ? determinaTipoRichiesta(r.fido_attuale, valore) : r.tipo,
    } : r));
  }
  function aggiornaTipo(id: string, tipo: RigaProposta["tipo"]) {
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, tipo } : r));
  }
  function aggiornaMotivazioneRiga(id: string, valore: string | undefined) {
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, motivazione: valore } : r));
  }
  function rimuoviRiga(id: string) {
    setRighe((prev) => prev.filter((r) => r.cliente_id !== id));
    onRemove(id);
  }

  // Quando cambia tipoForzato, ricalcola
  useEffect(() => {
    if (tipoForzato === "auto") {
      setRighe((prev) => prev.map((r) => ({ ...r, tipo: determinaTipoRichiesta(r.fido_attuale, r.fido_proposto) })));
    } else {
      setRighe((prev) => prev.map((r) => ({ ...r, tipo: tipoForzato })));
    }
  }, [tipoForzato]);

  const totale = righe.reduce((acc, r) => acc + (Number(r.fido_proposto) || 0), 0);

  async function creaRichieste() {
    if (righe.length === 0) { toast.error("Nessuna riga da creare"); return; }
    if (!userId) { toast.error("Utente non autenticato"); return; }
    setSubmitting(true);
    try {
      const stato = modalitaInvio === "bozza" ? "bozza" : "in_attesa_liv1";
      // Motivazione: override per-riga se valorizzato (anche stringa vuota = override "vuoto"),
      // altrimenti motivazione generale. Stringhe vuote -> null nel DB.
      const motivazioneGeneraleNorm = motivazioneGenerale.trim() === "" ? null : motivazioneGenerale;
      const payload = righe.map((r) => {
        const m = r.motivazione === undefined
          ? motivazioneGeneraleNorm
          : (r.motivazione.trim() === "" ? null : r.motivazione);
        return {
          cliente_id: r.cliente_id,
          tipo: r.tipo,
          importo_richiesto: r.fido_proposto,
          stato,
          created_by: userId,
          motivazione: m,
        };
      });
      const { error } = await supabase.from("richieste_fido").insert(payload as any);
      if (error) throw error;
      toast.success(`${righe.length} richieste create`);
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore nella creazione");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Proposta fido massiva — {righe.length} clienti</DialogTitle>
          <DialogDescription>
            Crea una richiesta fido per ogni cliente selezionato.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Modalità invio</Label>
            <RadioGroup value={modalitaInvio} onValueChange={(v) => setModalitaInvio(v as any)} className="mt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="bozza" /> Salva come bozza
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="invia" /> Invia subito all'approvazione
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Tipo richiesta applicato a tutti</Label>
            <Select value={tipoForzato} onValueChange={(v) => setTipoForzato(v as any)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatico (in base al fido attuale)</SelectItem>
                <SelectItem value="nuovo_fido">Nuovo fido</SelectItem>
                <SelectItem value="aumento">Aumento fido</SelectItem>
                <SelectItem value="diminuzione">Diminuzione fido</SelectItem>
                <SelectItem value="rinnovo">Rinnovo fido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Motivazione (applicata a tutti)</Label>
          <Textarea
            value={motivazioneGenerale}
            onChange={(e) => setMotivazioneGenerale(e.target.value)}
            placeholder="Motivazione comune a tutte le richieste del batch"
            className="mt-2 min-h-16"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Opzionale. Puoi sovrascriverla per singolo cliente dall'icona <MessageSquare className="inline size-3" /> sulla riga.
          </p>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Fido attuale</TableHead>
                <TableHead className="text-right">Esposizione</TableHead>
                <TableHead className="text-right">Fido proposto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-10">Mot.</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {righe.map((r) => {
                const hasOverride = r.motivazione !== undefined;
                return (
                  <TableRow key={r.cliente_id}>
                    <TableCell className="font-medium text-sm">{r.ragione_sociale}</TableCell>
                    <TableCell className="text-right text-sm">{fmtEuro(r.fido_attuale)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtEuro(r.esposizione)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="h-8 text-right w-32 ml-auto"
                        value={r.fido_proposto}
                        onChange={(e) => aggiornaImporto(r.cliente_id, Number(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={r.tipo} onValueChange={(v) => aggiornaTipo(r.cliente_id, v as RigaProposta["tipo"])}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nuovo_fido">Nuovo fido</SelectItem>
                          <SelectItem value="aumento">Aumento</SelectItem>
                          <SelectItem value="diminuzione">Diminuzione</SelectItem>
                          <SelectItem value="rinnovo">Rinnovo</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={hasOverride ? "text-primary" : ""}
                            title={hasOverride ? "Motivazione personalizzata" : "Eredita motivazione generale"}
                          >
                            <MessageSquare className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" align="end">
                          <div className="space-y-2">
                            <Label className="text-xs">Motivazione per questo cliente</Label>
                            <Textarea
                              value={hasOverride ? r.motivazione ?? "" : motivazioneGenerale}
                              onChange={(e) => aggiornaMotivazioneRiga(r.cliente_id, e.target.value)}
                              placeholder="Lascia vuoto per ereditare quella generale"
                              className="min-h-20"
                            />
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">
                                {hasOverride ? "Personalizzata" : "Eredita generale"}
                              </span>
                              {hasOverride && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => aggiornaMotivazioneRiga(r.cliente_id, undefined)}
                                >
                                  Reimposta
                                </Button>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => rimuoviRiga(r.cliente_id)} title="Rimuovi">
                        <X className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm font-medium">
          Totale fido proposto: <strong>{fmtEuro(totale)}</strong> · {righe.length} richieste da creare
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annulla</Button>
          <Button onClick={creaRichieste} disabled={submitting || righe.length === 0}>
            {submitting ? "Creazione…" : "Crea richieste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============================================================================
// WIZARD SCHEDA CLIENTE — Modalità "Crea con firma" / "Crea senza firma"
// ============================================================================

const schedaSchema = z.object({
  tipo: z.enum(["nuovo", "aggiornamento"]),
  tipo_soggetto: z.enum(["persona_fisica", "azienda"]),
  // STEP 1 — Impresa
  ragione_sociale: z.string().trim().min(1, "Obbligatorio").max(200),
  codice_gestionale: z.string().trim().max(50).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  provincia: z.string().trim().max(2).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  telefono_2: z.string().trim().max(30).optional().or(z.literal("")),
  forma_giuridica: z.string().trim().max(100).optional().or(z.literal("")),
  codice_macrocategoria: z.string().trim().max(10).optional().or(z.literal("")),
  macrocategoria: z.string().trim().max(100).optional().or(z.literal("")),
  codice_categoria: z.string().trim().max(10).optional().or(z.literal("")),
  categoria: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  partita_iva: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  banca: z.string().trim().max(120).optional().or(z.literal("")),
  agenzia: z.string().trim().max(120).optional().or(z.literal("")),
  abi: z.string().trim().max(20).optional().or(z.literal("")),
  cab: z.string().trim().max(20).optional().or(z.literal("")),
  codice_sdi: z.string().trim().max(20).optional().or(z.literal("")),
  pec: z.string().trim().max(255).optional().or(z.literal("")),
  store_id: z.string().uuid().optional().or(z.literal("")),
  // STEP 2 — Contatti (nome/cognome separati)
  titolare_nome: z.string().trim().max(100).optional().or(z.literal("")),
  titolare_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  titolare_email: z.string().trim().max(255).optional().or(z.literal("")),
  titolare_cell: z.string().trim().max(30).optional().or(z.literal("")),
  amministrativo_nome: z.string().trim().max(100).optional().or(z.literal("")),
  amministrativo_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  amministrativo_email: z.string().trim().max(255).optional().or(z.literal("")),
  amministrativo_cell: z.string().trim().max(30).optional().or(z.literal("")),
  // STEP 3 — Amministrazione (admin/approvatori)
  codice_assegnato: z.string().trim().max(50).optional().or(z.literal("")),
  sede_operatore: z.string().trim().max(100).optional().or(z.literal("")),
  condizioni_pagamento_concordate: z.string().trim().max(200).optional().or(z.literal("")),
  condizione_pagamento_cod: z.string().trim().max(20).optional().or(z.literal("")),
  condizione_pagamento_desc: z.string().trim().max(200).optional().or(z.literal("")),
  data_richiesta_affidamento: z.string().optional().or(z.literal("")),
  importo_affidamento_richiesto: z.string().optional().or(z.literal("")),
  note_amministrazione: z.string().trim().max(2000).optional().or(z.literal("")),
  // STEP 4 — Firma (solo modalità con firma)
  dichiarante_nome: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_societa: z.string().trim().max(200).optional().or(z.literal("")),
  dichiarante_luogo_nascita: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_data_nascita: z.string().optional().or(z.literal("")),
  dichiarante_codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  dichiarante_residenza: z.string().trim().max(200).optional().or(z.literal("")),
  dichiarante_email: z.string().trim().max(255).optional().or(z.literal("")),
  dichiarante_cell: z.string().trim().max(30).optional().or(z.literal("")),
  dichiarante_data_firma: z.string().optional().or(z.literal("")),
  consenso_profilazione: z.enum(["", "si", "no"]).optional().default(""),
  consenso_marketing_media: z.enum(["", "si", "no"]).optional().default(""),
  consenso_marketing_diretto: z.enum(["", "si", "no"]).optional().default(""),
  whatsapp_opt_in: z.boolean().optional().default(false),
});

type SchedaForm = z.infer<typeof schedaSchema>;

const emptyForm: SchedaForm = {
  tipo: "nuovo",
  tipo_soggetto: "azienda",
  ragione_sociale: "",
  codice_gestionale: "",
  indirizzo: "", cap: "", citta: "", provincia: "",
  telefono: "", telefono_2: "", email: "",
  forma_giuridica: "",
  codice_macrocategoria: "", macrocategoria: "",
  codice_categoria: "", categoria: "",
  partita_iva: "", codice_fiscale: "",
  banca: "", agenzia: "", abi: "", cab: "",
  codice_sdi: "", pec: "",
  store_id: "",
  titolare_nome: "", titolare_cognome: "", titolare_email: "", titolare_cell: "",
  amministrativo_nome: "", amministrativo_cognome: "", amministrativo_email: "", amministrativo_cell: "",
  codice_assegnato: "", sede_operatore: "", condizioni_pagamento_concordate: "", condizione_pagamento_cod: "", condizione_pagamento_desc: "",
  data_richiesta_affidamento: "", importo_affidamento_richiesto: "",
  note_amministrazione: "",
  dichiarante_nome: "", dichiarante_cognome: "",
  dichiarante_societa: "", dichiarante_luogo_nascita: "", dichiarante_data_nascita: "",
  dichiarante_codice_fiscale: "", dichiarante_residenza: "",
  dichiarante_email: "", dichiarante_cell: "", dichiarante_data_firma: "",
  consenso_profilazione: "", consenso_marketing_media: "", consenso_marketing_diretto: "",
  whatsapp_opt_in: false,
};

type ModalitaCreazione = "con_firma" | "senza_firma" | null;

function SchedaClienteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const canSeeAdminStep = !isStoreManager; // admin + approvatori

  const [modalita, setModalita] = useState<ModalitaCreazione>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SchedaForm>(() => ({
    ...emptyForm,
    data_richiesta_affidamento: new Date().toISOString().slice(0, 10),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);

  // Stato per modalità Aggiornamento: cliente selezionato e contatti esistenti
  const [clienteEsistenteId, setClienteEsistenteId] = useState<string | null>(null);
  const [titolareEsistenteId, setTitolareEsistenteId] = useState<string | null>(null);
  const [amministrativoEsistenteId, setAmministrativoEsistenteId] = useState<string | null>(null);

  // Carica un cliente esistente e precompila il form (modalità Aggiornamento)
  async function caricaClienteEsistente(clienteId: string) {
    const { data: cliente, error } = await supabase
      .from("clienti").select("*").eq("id", clienteId).maybeSingle();
    if (error || !cliente) {
      toast.error("Impossibile caricare il cliente selezionato");
      return;
    }
    const { data: contatti } = await supabase
      .from("contatti").select("*").eq("cliente_id", clienteId).order("principale", { ascending: false });
    const titolare = (contatti ?? []).find((c: any) => c.principale) ?? null;
    const amm = (contatti ?? []).find((c: any) => !c.principale) ?? null;

    setClienteEsistenteId(clienteId);
    setTitolareEsistenteId(titolare?.id ?? null);
    setAmministrativoEsistenteId(amm?.id ?? null);

    const c = cliente as any;
    setForm((f) => ({
      ...f,
      tipo: "aggiornamento",
      tipo_soggetto: (c.tipo_soggetto === "persona_fisica" ? "persona_fisica" : "azienda") as SchedaForm["tipo_soggetto"],
      ragione_sociale: c.ragione_sociale ?? "",
      codice_gestionale: c.codice_gestionale ?? "",
      indirizzo: c.indirizzo ?? "",
      cap: c.cap ?? "",
      citta: c.citta ?? "",
      provincia: c.provincia ?? "",
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      partita_iva: c.partita_iva ?? "",
      codice_fiscale: c.codice_fiscale ?? "",
      banca: c.banca ?? "",
      agenzia: c.agenzia ?? "",
      abi: c.abi ?? "",
      cab: c.cab ?? "",
      codice_sdi: c.codice_sdi ?? "",
      pec: c.pec ?? "",
      store_id: c.store_id ?? "",
      titolare_nome: titolare?.nome ?? "",
      titolare_cognome: titolare?.cognome ?? "",
      titolare_email: titolare?.email ?? "",
      titolare_cell: titolare?.cellulare ?? titolare?.telefono ?? "",
      amministrativo_nome: amm?.nome ?? "",
      amministrativo_cognome: amm?.cognome ?? "",
      amministrativo_email: amm?.email ?? "",
      amministrativo_cell: amm?.cellulare ?? amm?.telefono ?? "",
      codice_assegnato: c.codice_assegnato ?? "",
      sede_operatore: c.sede_operatore ?? "",
      condizioni_pagamento_concordate: c.condizioni_pagamento_concordate ?? "",
      condizione_pagamento_cod: (c as any).condizione_pagamento_cod ?? "",
      condizione_pagamento_desc: (c as any).condizione_pagamento_desc ?? "",
      data_richiesta_affidamento: c.data_richiesta_affidamento ?? "",
      importo_affidamento_richiesto: c.importo_affidamento_richiesto != null ? String(c.importo_affidamento_richiesto) : "",
      note_amministrazione: c.note_amministrazione ?? "",
      dichiarante_nome: c.dichiarante_nome ?? "",
      dichiarante_cognome: c.dichiarante_cognome ?? "",
    }));
    toast.success(`Cliente "${c.ragione_sociale}" caricato`);
  }

  function resetClienteEsistente() {
    setClienteEsistenteId(null);
    setTitolareEsistenteId(null);
    setAmministrativoEsistenteId(null);
  }

  // Steps dinamici in base a modalità e ruolo
  const steps = useMemo(() => {
    const s = ["Impresa", "Contatti"];
    if (canSeeAdminStep) s.push("Amministrazione");
    if (modalita === "con_firma") s.push("Firma");
    return s;
  }, [modalita, canSeeAdminStep]);

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  function set<K extends keyof SchedaForm>(k: K, v: SchedaForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const validateStep = (s: number): boolean => {
    const label = steps[s];
    const errs: Record<string, string> = {};
    if (label === "Impresa") {
      if (form.tipo === "aggiornamento" && !clienteEsistenteId) {
        errs.ragione_sociale = "Seleziona il cliente da aggiornare dal campo di ricerca sopra";
        toast.error("Seleziona prima un cliente esistente dal campo di ricerca");
      } else if (!form.ragione_sociale.trim()) {
        errs.ragione_sociale = "Obbligatorio";
      }
      if (form.email && !z.string().email().safeParse(form.email).success) errs.email = "Email non valida";
    }
    if (label === "Contatti") {
      if (!(form.titolare_nome ?? "").trim()) errs.titolare_nome = "Nome Titolare obbligatorio";
      if (!(form.titolare_cognome ?? "").trim()) errs.titolare_cognome = "Cognome Titolare obbligatorio";
    }
    if (label === "Firma") {
      if (!(form.dichiarante_nome ?? "").trim()) errs.dichiarante_nome = "Obbligatorio";
      if (!(form.dichiarante_cognome ?? "").trim()) errs.dichiarante_cognome = "Obbligatorio";
      if (!hasSig) errs.firma = "Firma obbligatoria";
      if (form.consenso_profilazione !== "si" && form.consenso_profilazione !== "no") errs.consenso_profilazione = "Scegli un'opzione";
      if (form.consenso_marketing_media !== "si" && form.consenso_marketing_media !== "no") errs.consenso_marketing_media = "Scegli un'opzione";
      if (form.consenso_marketing_diretto !== "si" && form.consenso_marketing_diretto !== "no") errs.consenso_marketing_diretto = "Scegli un'opzione";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    // Quando si passa allo step Firma, precompila il dichiarante dal Titolare
    const next = steps[step + 1];
    if (next === "Firma") {
      setForm((f) => ({
        ...f,
        dichiarante_nome: f.dichiarante_nome || f.titolare_nome || "",
        dichiarante_cognome: f.dichiarante_cognome || f.titolare_cognome || "",
      }));
    }
    setStep((s) => s + 1);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schedaSchema.parse(form);
      const conFirma = modalita === "con_firma";

      let dataUrl: string | null = null;
      if (conFirma) {
        dataUrl = padRef.current ? getCanvasDataURL(padRef.current) : null;
        if (!dataUrl) throw new Error("Inserisci la firma");
      }

      const now = new Date();
      const { data: { user } } = await supabase.auth.getUser();

      const isAggiornamento = parsed.tipo === "aggiornamento" && !!clienteEsistenteId;
      let clienteId: string | null = isAggiornamento ? clienteEsistenteId : null;
      const uploadedPaths: Array<{ bucket: string; path: string }> = [];

      const rollback = async (reason: string) => {
        try {
          for (const u of uploadedPaths) {
            await supabase.storage.from(u.bucket).remove([u.path]);
          }
          // In aggiornamento NON eliminiamo il cliente esistente
          if (!isAggiornamento && clienteId) {
            await supabase.from("contatti").delete().eq("cliente_id", clienteId);
            await supabase.from("clienti").delete().eq("id", clienteId);
          }
        } catch { /* best-effort */ }
        throw new Error(reason);
      };

      try {
        // 1. INSERT/UPDATE cliente (dati Step 1 + Step 3 se admin)
        const num = (s?: string) => {
          if (!s) return null;
          const n = Number(String(s).replace(",", "."));
          return Number.isFinite(n) ? n : null;
        };
        const date = (s?: string) => (s && s.trim() ? s : null);

        const clientePayload: Record<string, unknown> = {
          ragione_sociale: parsed.ragione_sociale,
          tipo_soggetto: parsed.tipo_soggetto,
          codice_gestionale: parsed.codice_gestionale || null,
          partita_iva: parsed.partita_iva || null,
          codice_fiscale: parsed.codice_fiscale || null,
          indirizzo: parsed.indirizzo || null,
          cap: parsed.cap || null,
          citta: parsed.citta || null,
          provincia: parsed.provincia || null,
          telefono: parsed.telefono || null,
          telefono_2: parsed.telefono_2 || null,
          forma_giuridica: parsed.forma_giuridica || null,
          codice_macrocategoria: parsed.codice_macrocategoria || null,
          macrocategoria: parsed.macrocategoria || null,
          codice_categoria: parsed.codice_categoria || null,
          categoria: parsed.categoria || null,
          email: parsed.email || null,
          banca: parsed.banca || null,
          agenzia: parsed.agenzia || null,
          abi: parsed.abi || null,
          cab: parsed.cab || null,
          codice_sdi: parsed.codice_sdi || null,
          pec: parsed.pec || null,
          store_id: parsed.store_id || null,
          dichiarante_nome: parsed.dichiarante_nome || null,
          dichiarante_cognome: parsed.dichiarante_cognome || null,
        };
        if (!isAggiornamento) {
          clientePayload.created_by = user?.id;
        }
        if (canSeeAdminStep) {
          Object.assign(clientePayload, {
            codice_assegnato: parsed.codice_assegnato || null,
            condizioni_pagamento_concordate: parsed.condizione_pagamento_desc || parsed.condizioni_pagamento_concordate || null,
            condizione_pagamento_cod: parsed.condizione_pagamento_cod || null,
            condizione_pagamento_desc: parsed.condizione_pagamento_desc || null,
            data_richiesta_affidamento: date(parsed.data_richiesta_affidamento),
            importo_affidamento_richiesto: num(parsed.importo_affidamento_richiesto),
            note_amministrazione: parsed.note_amministrazione || null,
          });
        }

        if (isAggiornamento) {
          const { error: eUpd } = await supabase
            .from("clienti").update(clientePayload as never).eq("id", clienteId!);
          if (eUpd) throw new Error(`Aggiornamento cliente: ${eUpd.message}`);
        } else {
          const { data: cliente, error: e1 } = await supabase
            .from("clienti").insert(clientePayload as never).select("id").single();
          if (e1) throw new Error(`Inserimento cliente: ${e1.message}`);
          if (!cliente || !(cliente as { id?: string }).id) {
            throw new Error("Inserimento cliente: id non restituito");
          }
          clienteId = (cliente as { id: string }).id;
        }

        // 2. INSERT/UPDATE contatti (Titolare sempre, Amm.vo se compilato).
        const titolarePayload: Record<string, unknown> = {
          cliente_id: clienteId,
          nome: parsed.titolare_nome,
          cognome: parsed.titolare_cognome || null,
          ruolo: "Titolare / Legale Rappresentante",
          email: parsed.titolare_email || null,
          cellulare: parsed.titolare_cell || null,
          principale: true,
        };
        const ammPayload: Record<string, unknown> | null = (parsed.amministrativo_nome ?? "").trim()
          ? {
              cliente_id: clienteId,
              nome: parsed.amministrativo_nome,
              cognome: parsed.amministrativo_cognome || null,
              ruolo: "Referente Amministrativo",
              email: parsed.amministrativo_email || null,
              cellulare: parsed.amministrativo_cell || null,
              principale: false,
            }
          : null;

        let contattiCreati: Array<{ id: string; principale: boolean }> = [];
        if (isAggiornamento) {
          if (titolareEsistenteId) {
            const { error } = await supabase.from("contatti")
              .update(titolarePayload as never).eq("id", titolareEsistenteId);
            if (error) throw new Error(`Aggiornamento titolare: ${error.message}`);
            contattiCreati.push({ id: titolareEsistenteId, principale: true });
          } else {
            const { data, error } = await supabase.from("contatti")
              .insert(titolarePayload as never).select("id, principale").single();
            if (error) throw new Error(`Inserimento titolare: ${error.message}`);
            if (data) contattiCreati.push(data as { id: string; principale: boolean });
          }
          if (ammPayload) {
            if (amministrativoEsistenteId) {
              const { error } = await supabase.from("contatti")
                .update(ammPayload as never).eq("id", amministrativoEsistenteId);
              if (error) throw new Error(`Aggiornamento referente: ${error.message}`);
            } else {
              const { error } = await supabase.from("contatti")
                .insert(ammPayload as never);
              if (error) throw new Error(`Inserimento referente: ${error.message}`);
            }
          }
        } else {
          const contattiToInsert: Array<Record<string, unknown>> = [titolarePayload];
          if (ammPayload) contattiToInsert.push(ammPayload);
          const { data, error: e5 } = await supabase
            .from("contatti")
            .insert(contattiToInsert as never)
            .select("id, principale");
          if (e5) throw new Error(`Salvataggio contatti: ${e5.message}`);
          contattiCreati = (data ?? []) as Array<{ id: string; principale: boolean }>;
        }

        // 2.bis Se è stato indicato un Importo Affidamento Richiesto, crea
        //       una richiesta_fido in bozza che segue il normale iter di approvazione.
        if (canSeeAdminStep) {
          const importoRichiesto = num(parsed.importo_affidamento_richiesto);
          if (importoRichiesto != null && importoRichiesto > 0) {
            try {
              const importoNum = Number(importoRichiesto);
              const livelloCalc = importoNum <= 5000 ? 1 : importoNum <= 20000 ? 2 : 3;
              const payload = {
                cliente_id: clienteId,
                store_id: parsed.store_id || null,
                tipo: "nuovo_fido",
                stato: "bozza",
                importo_richiesto: importoRichiesto,
                livello_richiesto: livelloCalc,
                livello_corrente: livelloCalc,
                motivazione: parsed.note_amministrazione || null,
                created_by: user?.id ?? null,
              };
              const { error: eRf } = await supabase
                .from("richieste_fido")
                .insert(payload as never)
                .select()
                .single();
              if (eRf) {
                toast.warning(`Cliente creato, ma richiesta fido non generata: ${eRf.message}`);
              } else {
                toast.success("Richiesta fido in bozza creata");
              }
            } catch (rfErr) {
              console.error("[richiesta-fido] eccezione:", rfErr);
              const m = rfErr instanceof Error ? rfErr.message : "Errore richiesta fido";
              toast.warning(`Cliente creato, ma richiesta fido non generata: ${m}`);
            }
          } else {
            toast.info("Richiesta fido non creata: importo affidamento mancante o = 0");
          }
        }



        // 3. Solo ORA, se richiesto, generiamo firma + PDF. Eventuali errori
        //    qui NON devono distruggere il cliente/contatti già salvati.
        if (conFirma && dataUrl) {
          try {
            // Upload firma PNG
            const pngBlob = await (await fetch(dataUrl)).blob();
            const firmaPath = `clienti/${clienteId}/firma-${now.getTime()}.png`;
            const { error: e2 } = await supabase.storage.from("firme")
              .upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
            if (e2) throw new Error(`Upload firma: ${e2.message}`);
            // Bucket "firme" privato: genera URL firmato a lunga scadenza (10 anni)
            const { data: signed, error: eSigned } = await supabase.storage
              .from("firme")
              .createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
            if (eSigned || !signed?.signedUrl) throw new Error(`Signed URL firma: ${eSigned?.message ?? "vuoto"}`);
            const firmaUrl = signed.signedUrl;

            // Genera PDF scheda cliente
            const storeNome =
              (stores ?? []).find((s) => s.id === parsed.store_id)?.nome ?? null;

            const schedaPayload = {
              tipo: parsed.tipo,
              tipoSoggetto: parsed.tipo_soggetto,
              ragioneSociale: parsed.ragione_sociale,
              indirizzo: parsed.indirizzo,
              cap: parsed.cap,
              citta: parsed.citta,
              provincia: parsed.provincia,
              telefono: parsed.telefono,
              email: parsed.email,
              partitaIva: parsed.partita_iva,
              codiceFiscale: parsed.codice_fiscale,
              banca: parsed.banca,
              agenzia: parsed.agenzia,
              abi: parsed.abi,
              cab: parsed.cab,
              codiceSdi: parsed.codice_sdi,
              pec: parsed.pec,
              codiceGestionale: parsed.codice_gestionale,
              puntoVendita: storeNome,
              titolareNome: parsed.titolare_nome,
              titolareCognome: parsed.titolare_cognome,
              titolareEmail: parsed.titolare_email,
              titolareCell: parsed.titolare_cell,
              amministrativoNome: parsed.amministrativo_nome,
              amministrativoCognome: parsed.amministrativo_cognome,
              amministrativoEmail: parsed.amministrativo_email,
              amministrativoCell: parsed.amministrativo_cell,
              dichiaranteNome: parsed.dichiarante_nome,
              dichiaranteCognome: parsed.dichiarante_cognome,
              dichiaranteSocieta: parsed.dichiarante_societa || parsed.ragione_sociale,
              dichiaranteLuogoNascita: parsed.dichiarante_luogo_nascita,
              dichiaranteDataNascita: parsed.dichiarante_data_nascita,
              dichiaranteCodiceFiscale: parsed.dichiarante_codice_fiscale,
              dichiaranteResidenza: parsed.dichiarante_residenza,
              dichiaranteEmail: parsed.dichiarante_email,
              dichiaranteCell: parsed.dichiarante_cell,
              consensoProfilazione: parsed.consenso_profilazione,
              consensoMarketingMedia: parsed.consenso_marketing_media,
              consensoMarketingDiretto: parsed.consenso_marketing_diretto,
              whatsappOptIn: parsed.whatsapp_opt_in === true,
              firmaPngDataUrl: dataUrl,
              dataFirma: now,
            };

            const pdfBytes = await generaSchedaCliente(schedaPayload);


            const pdfSchedaPath = `clienti/${clienteId}/scheda-${now.getTime()}.pdf`;
            const { error: e3 } = await supabase.storage.from("documenti-privacy")
              .upload(pdfSchedaPath, pdfBytes, { contentType: "application/pdf", upsert: true });
            if (e3) throw new Error(`Upload scheda PDF: ${e3.message}`);
            // Bucket privato: signed URL a lunga scadenza (10 anni). Il path è la fonte di verità.
            const { data: pdfSchedaSigned, error: eSchedaSigned } = await supabase.storage
              .from("documenti-privacy")
              .createSignedUrl(pdfSchedaPath, 60 * 60 * 24 * 365 * 10);
            if (eSchedaSigned) throw new Error(`Signed URL scheda: ${eSchedaSigned.message}`);
            const pdfSchedaUrl = pdfSchedaSigned.signedUrl;

            // Aggiorna cliente con riepilogo firma
            await supabase.from("clienti").update({
              privacy_firmata: true,
              data_firma: now.toISOString(),
              firma_url: firmaUrl,
              scheda_pdf_url: pdfSchedaUrl,
            } as never).eq("id", clienteId!);

            // Aggiorna il contatto titolare con i riferimenti firma/PDF + dati dichiarante + consensi
            const titolare = (contattiCreati ?? []).find((c: any) => c.principale);
            if (titolare) {
              await supabase.from("contatti").update({
                privacy_firmata: true,
                data_firma: now.toISOString(),
                firma_url: firmaUrl,
                pdf_privacy_url: pdfSchedaUrl,
                pdf_privacy_path: pdfSchedaPath,
                luogo_nascita: parsed.dichiarante_luogo_nascita || null,
                data_nascita: parsed.dichiarante_data_nascita || null,
                codice_fiscale: parsed.dichiarante_codice_fiscale || null,
                residenza: parsed.dichiarante_residenza || null,
                email: parsed.dichiarante_email || parsed.titolare_email || null,
                cellulare: parsed.dichiarante_cell || parsed.titolare_cell || null,
                whatsapp_opt_in: parsed.whatsapp_opt_in === true,
                consenso_profilazione: parsed.consenso_profilazione === "si",
                consenso_marketing_media: parsed.consenso_marketing_media === "si",
                consenso_marketing_diretto: parsed.consenso_marketing_diretto === "si",
              } as never).eq("id", (titolare as { id: string }).id);
            }
          } catch (pdfErr) {
            // [DEBUG] Errore completo con stack trace
            console.error("[scheda-pdf] errore generazione/upload PDF:", pdfErr);
            if (pdfErr instanceof Error) {
              console.error("[scheda-pdf] stack:", pdfErr.stack);
            }

            // NON eseguire rollback: cliente e contatti restano salvati.
            const m = pdfErr instanceof Error ? pdfErr.message : "Errore generazione PDF";
            toast.warning(`Cliente salvato senza PDF firmato: ${m}`);
          }
        }


        return clienteId;
      } catch (err) {

        const msg = err instanceof Error ? err.message : "Errore durante il salvataggio";
        await rollback(msg);
        return null;
      }
    },
    onSuccess: () => {
      toast.success(
        modalita === "con_firma"
          ? "Scheda cliente creata e firmata"
          : "Scheda cliente creata"
      );
      qc.invalidateQueries({ queryKey: ["clienti"] });
      onClose();
    },
    onError: (err: any) => {
      const code = err?.code ?? "";
      const msg = err?.message ?? "";
      if (code === "23505" || msg.includes("clienti_codice_gestionale_unique")) {
        toast.error("Codice gestionale già utilizzato. Inseriscine uno diverso o lascialo vuoto.");
        setStep(0);
        return;
      }
      toast.error(msg || "Errore durante il salvataggio");
    },
  });

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step, steps.length]);
  const currentStepLabel = steps[step];

  // --- Selezione modalità iniziale ---
  if (modalita === null) {
    return (
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova scheda cliente</DialogTitle>
          <DialogDescription>Scegli come vuoi creare la scheda.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <button
            type="button"
            onClick={() => { setModalita("con_firma"); setStep(0); }}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-accent/40 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <PenTool className="size-5 text-primary" />
              <span className="font-semibold">Crea con firma</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Flusso completo con consenso privacy, firma grafometrica e generazione automatica del PDF MADE.
            </p>
          </button>
          <button
            type="button"
            onClick={() => { setModalita("senza_firma"); setStep(0); }}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-accent/40 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText className="size-5 text-primary" />
              <span className="font-semibold">Crea senza firma</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Inserimento rapido dell'anagrafica e dei contatti, senza firma né PDF (potrai raccoglierla dopo).
            </p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const isLastStep = step >= steps.length - 1;

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          Scheda inserimento cliente
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {modalita === "con_firma" ? "(con firma)" : "(senza firma)"}
          </span>
        </DialogTitle>
        <DialogDescription>
          Step {step + 1} di {steps.length} — {currentStepLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="space-y-4 mt-2">
        {currentStepLabel === "Impresa" && (
          <StepImpresa
            form={form}
            set={set}
            errors={errors}
            stores={stores ?? []}
            clienteEsistenteId={clienteEsistenteId}
            onSelectClienteEsistente={caricaClienteEsistente}
            onResetClienteEsistente={resetClienteEsistente}
          />
        )}
        {currentStepLabel === "Contatti" && (
          <StepContatti form={form} set={set} errors={errors} />
        )}
        {currentStepLabel === "Amministrazione" && (
          <StepAmministrazione form={form} set={set} />
        )}
        {currentStepLabel === "Firma" && (
          <StepFirma form={form} set={set} errors={errors} padRef={padRef} setHasSig={setHasSig} />
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4 mr-1" /> Indietro
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setModalita(null)}>
            <ArrowLeft className="size-4 mr-1" /> Cambia modalità
          </Button>
        )}
        {!isLastStep ? (
          <Button type="button" onClick={goNext}>
            Avanti <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={submit.isPending}
            onClick={() => { if (validateStep(step)) submit.mutate(); }}
          >
            {submit.isPending ? "Salvataggio..." : (
              <><Check className="size-4 mr-1" />
                {modalita === "con_firma" ? "Crea scheda e firma" : "Crea scheda"}
              </>
            )}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

type SetFn = <K extends keyof SchedaForm>(k: K, v: SchedaForm[K]) => void;

function ClientePicker({
  clienteEsistenteId,
  ragioneSocialeAttuale,
  onSelect,
  onReset,
}: {
  clienteEsistenteId: string | null;
  ragioneSocialeAttuale: string;
  onSelect: (clienteId: string) => void | Promise<void>;
  onReset: () => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const termTrim = term.trim();
  const { data: results, isFetching } = useQuery({
    queryKey: ["clienti-picker", termTrim],
    queryFn: async () => {
      if (termTrim.length < 2) return [];
      const like = `%${termTrim.replace(/[(),]/g, " ")}%`;
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, partita_iva, citta")
        .or(`ragione_sociale.ilike.${like},codice_gestionale.ilike.${like}`)
        .order("ragione_sociale")
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: termTrim.length >= 2 && !clienteEsistenteId,
  });

  if (clienteEsistenteId) {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-foreground">Aggiornamento di: {ragioneSocialeAttuale}</p>
          <p className="text-xs text-muted-foreground">Modifica i campi sotto e salva per aggiornare il cliente.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <X className="size-4 mr-1" /> Cambia cliente
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <Label className="text-sm">Cerca cliente da aggiornare *</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Digita ragione sociale o codice gestionale..."
          className="pl-9"
        />
      </div>
      {open && termTrim.length >= 2 && (
        <div className="rounded-md border bg-popover max-h-64 overflow-y-auto">
          {isFetching ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ricerca in corso…</p>
          ) : (results ?? []).length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nessun cliente trovato</p>
          ) : (
            (results ?? []).map((c: any) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                onClick={() => { onSelect(c.id); setOpen(false); setTerm(""); }}
              >
                <div className="font-medium">{c.ragione_sociale}</div>
                <div className="text-xs text-muted-foreground">
                  {c.codice_gestionale ? `Cod. ${c.codice_gestionale}` : "—"}
                  {c.partita_iva ? ` · P.IVA ${c.partita_iva}` : ""}
                  {c.citta ? ` · ${c.citta}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {termTrim.length > 0 && termTrim.length < 2 && (
        <p className="text-xs text-muted-foreground">Digita almeno 2 caratteri…</p>
      )}
    </div>
  );
}

function StepImpresa({
  form, set, errors, stores, clienteEsistenteId, onSelectClienteEsistente, onResetClienteEsistente,
}: {
  form: SchedaForm;
  set: SetFn;
  errors: Record<string, string>;
  stores: Array<{ id: string; nome: string; codice: string }>;
  clienteEsistenteId: string | null;
  onSelectClienteEsistente: (clienteId: string) => void | Promise<void>;
  onResetClienteEsistente: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo modulo</Label>
          <RadioGroup
            value={form.tipo}
            onValueChange={(v) => {
              set("tipo", v as SchedaForm["tipo"]);
              if (v !== "aggiornamento") onResetClienteEsistente();
            }}
            className="flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="nuovo" /> Nuovo inserimento
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="aggiornamento" /> Aggiornamento
            </label>
          </RadioGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo soggetto</Label>
          <RadioGroup value={form.tipo_soggetto} onValueChange={(v) => set("tipo_soggetto", v as SchedaForm["tipo_soggetto"])} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="persona_fisica" /> Persona fisica
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="azienda" /> Azienda
            </label>
          </RadioGroup>
        </div>
      </div>

      {form.tipo === "aggiornamento" && (
        <ClientePicker
          clienteEsistenteId={clienteEsistenteId}
          ragioneSocialeAttuale={form.ragione_sociale}
          onSelect={onSelectClienteEsistente}
          onReset={onResetClienteEsistente}
        />
      )}



      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Ragione sociale / Nominativo *</Label>
          <Input value={form.ragione_sociale} onChange={(e) => set("ragione_sociale", e.target.value)} />
          {errors.ragione_sociale && <p className="text-xs text-destructive">{errors.ragione_sociale}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Codice gestionale</Label>
          <Input value={form.codice_gestionale} onChange={(e) => set("codice_gestionale", e.target.value)} placeholder="es. 00123" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Indirizzo</Label>
        <Input value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>CAP</Label>
          <Input value={form.cap} onChange={(e) => set("cap", e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Città</Label>
          <Input value={form.citta} onChange={(e) => set("citta", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Prov.</Label>
          <Input maxLength={2} value={form.provincia} onChange={(e) => set("provincia", e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Telefono</Label>
          <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefono 2</Label>
          <Input value={form.telefono_2} onChange={(e) => set("telefono_2", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Partita IVA</Label>
          <Input value={form.partita_iva} onChange={(e) => set("partita_iva", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Codice fiscale</Label>
          <Input value={form.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-2">Dati bancari</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Banca</Label>
          <Input value={form.banca} onChange={(e) => set("banca", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>ABI</Label>
          <Input value={form.abi} onChange={(e) => set("abi", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Agenzia</Label>
          <Input value={form.agenzia} onChange={(e) => set("agenzia", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CAB</Label>
          <Input value={form.cab} onChange={(e) => set("cab", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-2">Fatturazione elettronica</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice SDI</Label>
          <Input value={form.codice_sdi} onChange={(e) => set("codice_sdi", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>PEC</Label>
          <Input type="email" value={form.pec} onChange={(e) => set("pec", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Punto vendita</Label>
        <Select value={form.store_id || undefined} onValueChange={(v) => set("store_id", v)}>
          <SelectTrigger><SelectValue placeholder={stores.length ? "Seleziona..." : "Nessuno disponibile"} /></SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <h3 className="font-semibold text-sm pt-2">Classificazione</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CategoriaSelect
          type="macrocategoria"
          codice={form.codice_macrocategoria ?? ""}
          label_value={form.macrocategoria ?? ""}
          onChange={(cod, lbl) => {
            set("codice_macrocategoria", cod);
            set("macrocategoria", lbl);
          }}
        />
        <CategoriaSelect
          type="categoria"
          codice={form.codice_categoria ?? ""}
          label_value={form.categoria ?? ""}
          onChange={(cod, lbl) => {
            set("codice_categoria", cod);
            set("categoria", lbl);
          }}
        />
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Forma giuridica</Label>
          <Input
            value={form.forma_giuridica}
            onChange={(e) => set("forma_giuridica", e.target.value)}
            placeholder="Es. S.r.l., S.p.A., Ditta individuale..."
          />
        </div>
      </div>
    </>
  );
}

function StepContatti({
  form, set, errors,
}: { form: SchedaForm; set: SetFn; errors: Record<string, string> }) {
  return (
    <>
      <h3 className="font-semibold text-sm">Titolare / Legale Rappresentante *</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.titolare_nome} onChange={(e) => set("titolare_nome", e.target.value)} />
          {errors.titolare_nome && <p className="text-xs text-destructive">{errors.titolare_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome *</Label>
          <Input value={form.titolare_cognome} onChange={(e) => set("titolare_cognome", e.target.value)} />
          {errors.titolare_cognome && <p className="text-xs text-destructive">{errors.titolare_cognome}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.titolare_email} onChange={(e) => set("titolare_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.titolare_cell} onChange={(e) => set("titolare_cell", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-3">
        Referente Amministrativo{" "}
        <span className="text-muted-foreground font-normal">(opzionale, se diverso dal Titolare)</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input value={form.amministrativo_nome} onChange={(e) => set("amministrativo_nome", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cognome</Label>
          <Input value={form.amministrativo_cognome} onChange={(e) => set("amministrativo_cognome", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.amministrativo_email} onChange={(e) => set("amministrativo_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.amministrativo_cell} onChange={(e) => set("amministrativo_cell", e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        I contatti saranno collegati automaticamente al cliente nella sezione "Contatti".
      </p>
    </>
  );
}

function StepAmministrazione({ form, set }: { form: SchedaForm; set: SetFn }) {
  return (
    <>
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Spazio riservato Amministrazione</p>
        <p className="text-muted-foreground">
          Sezione visibile solo ad amministratori e approvatori. Tutti i campi sono opzionali.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice assegnato</Label>
          <Input value={form.codice_assegnato} onChange={(e) => set("codice_assegnato", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <CondizionePagamentoSelect
          cod={form.condizione_pagamento_cod ?? ""}
          desc={form.condizione_pagamento_desc ?? ""}
          onChange={(cod, desc) => {
            set("condizione_pagamento_cod", cod);
            set("condizione_pagamento_desc", desc);
            set("condizioni_pagamento_concordate", desc);
          }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Data Richiesta Affidamento</Label>
          <Input type="date" value={form.data_richiesta_affidamento} onChange={(e) => set("data_richiesta_affidamento", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Importo Affidamento Richiesto (€)</Label>
          <Input type="number" step="0.01" value={form.importo_affidamento_richiesto} onChange={(e) => set("importo_affidamento_richiesto", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Note</Label>
        <Textarea rows={3} value={form.note_amministrazione} onChange={(e) => set("note_amministrazione", e.target.value)} />
      </div>
    </>
  );
}


const INFORMATIVA_FULL = `Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it - pec madedistribuzionesrl@pecplus.it) in persona del suo presidente Dott. Gian Luca Bellini, ai sensi dell'articolo 13 del GDPR 2016/679, Le fornisce le seguenti informazioni.

TIPI DI DATI: I dati personali (nome, cognome, estremi documento di riconoscimento, telefono, indirizzo e-mail, etc.) sono quelli forniti al momento della sottoscrizione o nel corso del rapporto contrattuale. Tra i dati conferiti possono figurare anche dati di cui all'art. 9 GDPR (categorie particolari di dati).

FINALITA' DI TRATTAMENTO: I dati saranno trattati per finalita' connesse all'esercizio delle attivita' aziendali (fornitura di prodotti nei campi edile, elettrotecnico e idraulico), per adempimenti fiscali/tributari/contributivi, per comunicazione a Enti pubblici o privati prevista per legge, per backup su server esterni con cifratura. Inoltre, previo consenso, per profilazione e analisi dati, per inserimento in pubblicazioni e social network, per invio di comunicazioni pubblicitarie via e-mail, sms, whatsapp.

CATEGORIE DI SOGGETTI: I dati potranno essere comunicati a dipendenti e collaboratori, societa' EDP, commercialisti, studi legali, clienti e fornitori, distributori e vettori, societa' del Gruppo Made, societa' che svolgono attivita' commerciale e di marketing.

MODALITA': Il trattamento sara' effettuato con strumenti manuali e/o informatici nel rispetto dei principi di correttezza, licceita' e trasparenza. E' possibile la cessione dei dati all'estero per finalita' di backup e utilizzo di software con server esteri (Microsoft 365).

TERMINE DI CONSERVAZIONE: I dati vengono conservati per tutta la durata del rapporto contrattuale e nei termini prescrizionali previsti, in ogni caso per non meno di 10 anni per obblighi fiscali.

DIRITTI DELL'INTERESSATO: Lei potra' esercitare i diritti di accesso (art. 15), rettifica (art. 16), cancellazione (art. 17), limitazione (art. 18), opposizione (art. 21), portabilita' (art. 20) e revoca del consenso (art. 7 co. 3) inviando richiesta a gdpr-md@madepoint.it. E' possibile proporre reclamo al Garante Privacy.

TITOLARE: Made Distribuzione S.p.A. - C.F. 10126430965 - gdpr-md@madepoint.it`;

const CONSENSO_TESTI = {
  profilazione: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di analisi anche con strumenti tecnologici automatizzati (profilazione) al fine di consentire al titolare di poter gestire un consolidato nazionale in tempo reale e al fine di poter analizzare i dati caricati sul software per poter indirizzare al meglio le strategie commerciali del network.",
  media: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing.",
  diretto: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di invio di informative per finalita' pubblicitarie e di marketing, anche via e-mail, sms, whatsapp.",
};

function StepFirma({
  form, set, errors, padRef, setHasSig,
}: {
  form: SchedaForm; set: SetFn; errors: Record<string, string>;
  padRef: React.RefObject<HTMLDivElement | null>; setHasSig: (b: boolean) => void;
}) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [dataFirma, setDataFirma] = useState(todayISO);

  const ConsensoBlock = ({
    k, testo,
  }: { k: "consenso_profilazione" | "consenso_marketing_media" | "consenso_marketing_diretto"; testo: string }) => (
    <div className="rounded-md border p-3 space-y-2">
      <p className="leading-relaxed" style={{ fontSize: "11px" }}>{testo}</p>
      <RadioGroup value={form[k]} onValueChange={(v) => set(k, v as "si" | "no")} className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="si" /> fornisce il consenso
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="no" /> nega il consenso
        </label>
      </RadioGroup>
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <>
      {/* SEZIONE 1 — Dati dichiarante */}
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Dati del Dichiarante (Titolare / Legale Rappresentante)</p>
        <p className="text-muted-foreground">Nome e cognome precompilati dallo step Contatti.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.dichiarante_nome} onChange={(e) => set("dichiarante_nome", e.target.value)} />
          {errors.dichiarante_nome && <p className="text-xs text-destructive">{errors.dichiarante_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome *</Label>
          <Input value={form.dichiarante_cognome} onChange={(e) => set("dichiarante_cognome", e.target.value)} />
          {errors.dichiarante_cognome && <p className="text-xs text-destructive">{errors.dichiarante_cognome}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Società / Ente rappresentato</Label>
        <Input value={form.dichiarante_societa} onChange={(e) => set("dichiarante_societa", e.target.value)} placeholder={form.ragione_sociale} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Luogo di nascita</Label>
          <Input value={form.dichiarante_luogo_nascita} onChange={(e) => set("dichiarante_luogo_nascita", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Data di nascita</Label>
          <Input type="date" value={form.dichiarante_data_nascita} onChange={(e) => set("dichiarante_data_nascita", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice fiscale</Label>
          <Input value={form.dichiarante_codice_fiscale} onChange={(e) => set("dichiarante_codice_fiscale", e.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1.5">
          <Label>Residenza</Label>
          <Input value={form.dichiarante_residenza} onChange={(e) => set("dichiarante_residenza", e.target.value)} placeholder="Via, n°, CAP, Città (Prov.)" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.dichiarante_email} onChange={(e) => set("dichiarante_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.dichiarante_cell} onChange={(e) => set("dichiarante_cell", e.target.value)} />
        </div>
      </div>

      {/* SEZIONE 2 — Informativa completa scrollabile */}
      <div
        className="rounded-md border bg-muted/40 p-3 overflow-y-auto whitespace-pre-line leading-relaxed"
        style={{ height: "250px", fontSize: "11px" }}
      >
        {INFORMATIVA_FULL}
      </div>

      {/* SEZIONE 3 — Testo introduttivo grassetto */}
      <p className="font-bold leading-relaxed" style={{ fontSize: "12px" }}>
        Il sottoscritto, avendo letto l'informativa fornita dal titolare del trattamento ai sensi dell'art. 13 GDPR sul trattamento e sulla comunicazione dei dati personali (comuni, sensibili) da questo effettuati, con le finalita' connesse all'adempimento del rapporto contrattuale e ai connessi adempimenti di legge, essendo consapevole che in mancanza di consenso ai predetti trattamenti il titolare non potra' - da un lato - assolvere gli obblighi di legge e quindi costituire o proseguire il rapporto contrattuale e - dall'altro - di svolgere la propria attivita' tipica,
      </p>

      {/* SEZIONE 4 — Tre blocchi consenso */}
      <div className="space-y-3">
        <ConsensoBlock k="consenso_profilazione" testo={CONSENSO_TESTI.profilazione} />
        <ConsensoBlock k="consenso_marketing_media" testo={CONSENSO_TESTI.media} />
        <ConsensoBlock k="consenso_marketing_diretto" testo={CONSENSO_TESTI.diretto} />
      </div>

      {/* SEZIONE 5 — Data + firma */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Data</Label>
          <Input type="date" value={dataFirma} onChange={(e) => setDataFirma(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Firma del dichiarante *</Label>
        <div ref={padRef}>
          <SignaturePad onChange={(empty) => setHasSig(!empty)} height={180} />
        </div>
        {errors.firma && <p className="text-xs text-destructive">{errors.firma}</p>}
      </div>
    </>
  );
}

// ============ Filtri avanzati dialog ============
type AdvOp = "none" | "lt" | "lte" | "gt" | "eq" | "between";
type AdvAppliedT = {
  fidoOp: AdvOp; fidoVal: number | null; fidoFrom: number | null; fidoTo: number | null;
  percConsumato: number | null;
  dataFattPrima: string; dataFattDopo: string;
  presetScopertoInsoluto: boolean;
};

function FiltriAvanzatiDialog({
  open, onOpenChange, applied, onApply, onReset, onSetMainFiltro, currentMain,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applied: AdvAppliedT;
  onApply: (a: AdvAppliedT) => void;
  onReset: () => void;
  onSetMainFiltro: (p: { filtroBlocco?: "tutti" | "bloccati" | "non_bloccati"; filtroAssic?: "tutti" | "assicurati" | "non_assicurati"; scadenziarioFiltro?: string }) => void;
  currentMain: { filtroBlocco: "tutti" | "bloccati" | "non_bloccati"; filtroAssic: "tutti" | "assicurati" | "non_assicurati"; scadenziarioFiltro: string };
}) {
  const [draft, setDraft] = useState<AdvAppliedT>(applied);
  useEffect(() => { if (open) setDraft(applied); }, [open, applied]);

  const PRESETS = [
    { id: "fido80", label: "Fido 80% consumato", apply: (d: AdvAppliedT) => ({ ...d, percConsumato: 80 }) },
    { id: "esaurito", label: "Fido esaurito", apply: (d: AdvAppliedT) => ({ ...d, fidoOp: "lte" as AdvOp, fidoVal: 0 }) },
    { id: "lt500", label: "Fido residuo < 500 €", apply: (d: AdvAppliedT) => ({ ...d, fidoOp: "lt" as AdvOp, fidoVal: 500 }) },
    { id: "lt1000", label: "Fido residuo < 1.000 €", apply: (d: AdvAppliedT) => ({ ...d, fidoOp: "lt" as AdvOp, fidoVal: 1000 }) },
    { id: "scoperto", label: "Scoperti con insoluto", apply: (d: AdvAppliedT) => ({ ...d, presetScopertoInsoluto: true }), main: { filtroAssic: "non_assicurati" } as const },
    { id: "blocFat", label: "Bloccati con fatturato 2025", apply: (d: AdvAppliedT) => d, main: { filtroBlocco: "bloccati" } as const },
  ];

  const isPresetActive = (id: string): boolean => {
    switch (id) {
      case "fido80": return draft.percConsumato === 80;
      case "esaurito": return draft.fidoOp === "lte" && draft.fidoVal === 0;
      case "lt500": return draft.fidoOp === "lt" && draft.fidoVal === 500;
      case "lt1000": return draft.fidoOp === "lt" && draft.fidoVal === 1000;
      case "scoperto": return draft.presetScopertoInsoluto;
      case "blocFat": return currentMain.filtroBlocco === "bloccati";
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtri avanzati</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Sezione A — Preset */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Ricerca rapida</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = isPresetActive(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDraft((d) => p.apply(d));
                      if (p.main) onSetMainFiltro(p.main);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Sezione B — Fido residuo personalizzato */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Filtro fido residuo</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={draft.fidoOp} onValueChange={(v) => setDraft((d) => ({ ...d, fidoOp: v as AdvOp }))}>
                <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nessuno —</SelectItem>
                  <SelectItem value="lt">minore di</SelectItem>
                  <SelectItem value="lte">minore o uguale a</SelectItem>
                  <SelectItem value="gt">maggiore di</SelectItem>
                  <SelectItem value="eq">uguale a</SelectItem>
                  <SelectItem value="between">tra</SelectItem>
                </SelectContent>
              </Select>
              {draft.fidoOp === "between" ? (
                <>
                  <Input type="number" placeholder="da €" className="w-28 h-9"
                    value={draft.fidoFrom ?? ""} onChange={(e) => setDraft((d) => ({ ...d, fidoFrom: e.target.value === "" ? null : Number(e.target.value) }))} />
                  <span className="text-muted-foreground">—</span>
                  <Input type="number" placeholder="a €" className="w-28 h-9"
                    value={draft.fidoTo ?? ""} onChange={(e) => setDraft((d) => ({ ...d, fidoTo: e.target.value === "" ? null : Number(e.target.value) }))} />
                </>
              ) : draft.fidoOp !== "none" ? (
                <Input type="number" placeholder="€" className="w-32 h-9"
                  value={draft.fidoVal ?? ""} onChange={(e) => setDraft((d) => ({ ...d, fidoVal: e.target.value === "" ? null : Number(e.target.value) }))} />
              ) : null}
            </div>
          </section>

          {/* Sezione C — Percentuale fido consumato */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Percentuale fido consumato</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Clienti che hanno consumato almeno <strong>{draft.percConsumato ?? 0}%</strong> del fido gestionale
            </p>
            <div className="flex items-center gap-3">
              <RadixSlider.Root
                className="relative flex h-5 flex-1 touch-none select-none items-center"
                min={0} max={100} step={5}
                value={[draft.percConsumato ?? 0]}
                onValueChange={(v) => setDraft((d) => ({ ...d, percConsumato: v[0] ?? 0 }))}
              >
                <RadixSlider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
                  <RadixSlider.Range className="absolute h-full bg-primary" />
                </RadixSlider.Track>
                <RadixSlider.Thumb className="block size-5 rounded-full border-2 border-primary bg-background shadow-sm outline-none" />
              </RadixSlider.Root>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setDraft((d) => ({ ...d, percConsumato: null }))}>
                Azzera
              </Button>
            </div>
          </section>

          {/* Sezione D — Ultima fatturazione */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Ultima fatturazione</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prima del</Label>
                <Input type="date" className="h-9"
                  value={draft.dataFattPrima}
                  onChange={(e) => setDraft((d) => ({ ...d, dataFattPrima: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Dopo il</Label>
                <Input type="date" className="h-9"
                  value={draft.dataFattDopo}
                  onChange={(e) => setDraft((d) => ({ ...d, dataFattDopo: e.target.value }))} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { setDraft({ fidoOp: "none", fidoVal: null, fidoFrom: null, fidoTo: null, percConsumato: null, dataFattPrima: "", dataFattDopo: "", presetScopertoInsoluto: false }); onReset(); }}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => onApply(draft)}>Applica filtri</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
