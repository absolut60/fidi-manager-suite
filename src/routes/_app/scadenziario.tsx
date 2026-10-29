import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, Fragment, useEffect, useRef } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Calendar, FileText, Ban, CalendarClock, Scale, ChevronDown, ChevronUp, Megaphone, Mail, Bell, ChevronLeft, ChevronRight, HandCoins, ArrowUp, ArrowDown, Download, Loader2, SlidersHorizontal, RotateCcw, Phone, StickyNote } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { InvioMassivoDialog } from "@/components/invio-massivo-dialog";
import { puoInviareComunicazioniRecupero, tipoAzioneConsentito } from "@/lib/recupero-permessi";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { useEsperienzaPagamentoCliente, testiPagateInRitardo } from "@/hooks/use-esperienza-pagamento";
import { useAzioniRecuperoCliente, useOperatoriAttivita, useStadioSollecitoCliente } from "@/hooks/use-azioni-recupero-cliente";
import { TIPO_PROMESSA, TIPO_AZIONE_ICON, TIPO_AZIONE_LABEL, testoAzione, tipoAzioneVisualizzato } from "@/lib/azioni-recupero-ui";
import { TooltipAzioneRecupero } from "@/components/tooltip-azione-recupero";
import { StadioSollecitoBadge, StadioSollecitoBadgeCompatto } from "@/components/stadio-sollecito-badge";
import type { StadioSollecito } from "@/lib/escalation-solleciti";
import { ClienteAttivitaRecuperoTab } from "@/components/cliente-attivita-recupero-tab";
import { ScadenziarioKpi, DettaglioCoperturaRiga } from "@/components/scadenziario/scadenziario-kpi";
import { CopertureScadenziario } from "@/components/scadenziario/coperture-scadenziario";
import { ScadenziarioPerStore } from "@/components/scadenziario/scadenziario-per-store";
import { useIsMobile } from "@/hooks/use-mobile";

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
  ha_promessa?: boolean | null;
  data_promessa?: string | null;
  ha_piano_rientro?: boolean | null;
  piano_rientro_id?: string | null;
  piano_rate_pagate?: number | null;
  piano_rate_totali?: number | null;
  piano_prossima_rata_data?: string | null;
  piano_prossima_rata_importo?: number | null;
  tot_scaduto_lordo?: number | string | null;
  coperto_piani?: number | string | null;
  coperto_promesse?: number | string | null;
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
  tot_coperto_piani?: number | string | null;
  tot_coperto_promesse?: number | string | null;
  n_clienti_coperti_piani?: number | null;
  n_clienti_coperti_promesse?: number | null;
  n_promesse_da_verificare?: number | null;
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

function useRischioCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ["rischio-expanded", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      if (!clienteId) return null;
      const { data, error } = await supabase
        .from("clienti")
        .select("fido_gestionale, fido_residuo, totale_rischio, doc_da_fatturare, doc_da_evadere, effetti_a_rischio, num_insoluti, dilazione_concordata, dilazione_effettiva, condizione_pagamento_cod, codice_agente, agente")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      let condizione_pagamento_desc_db: string | null = null;
      const cod = (data as { condizione_pagamento_cod: string | null } | null)?.condizione_pagamento_cod ?? null;
      if (cod) {
        const { data: cp } = await supabase
          .from("codici_pagamento")
          .select("descrizione")
          .eq("cod", cod)
          .maybeSingle();
        condizione_pagamento_desc_db = (cp as { descrizione: string } | null)?.descrizione ?? null;
      }
      return data ? { ...(data as object), condizione_pagamento_desc_db } as {
        fido_gestionale: number | null; fido_residuo: number | null; totale_rischio: number | null;
        doc_da_fatturare: number | null; doc_da_evadere: number | null; effetti_a_rischio: number | null;
        num_insoluti: number | null; dilazione_concordata: number | null; dilazione_effettiva: number | null;
        condizione_pagamento_cod: string | null; condizione_pagamento_desc_db: string | null;
        codice_agente: string | null; agente: string | null;
      } : null;
    },
  });
}

type Situazione = "con_scaduto" | "tutte" | "solo_a_scadere" | "scaduto_e_a_scadere" | "portafoglio";
const SITUAZIONE_LABEL: Record<Situazione, string> = {
  con_scaduto: "Con scaduto",
  tutte: "Tutte le scadenze aperte",
  solo_a_scadere: "Solo a scadere",
  scaduto_e_a_scadere: "Scaduto e a scadere",
  portafoglio: "Tutto il portafoglio clienti",
};

type SortKey =
  | "tot_scaduto" | "tot_a_scadere" | "ragione_sociale" | "max_gg"
  | "codice_gestionale" | "store_nome" | "bloccato" | "fatturato_cur" | "fatturato_prec"
  | "n_scadute" | "n_a_scadere" | "prossima_scadenza";
const SORT_LABEL: Record<SortKey, string> = {
  tot_scaduto: "Totale scaduto",
  tot_a_scadere: "Totale a scadere",
  ragione_sociale: "Cliente",
  max_gg: "Giorni ritardo",
  codice_gestionale: "Cod. gestionale",
  store_nome: "Store",
  bloccato: "Stato blocco",
  fatturato_cur: "Fatturato anno corrente",
  fatturato_prec: "Fatturato anno precedente",
  n_scadute: "N. fatture scadute",
  n_a_scadere: "N. fatture a scadere",
  prossima_scadenza: "Prossima scadenza",
};
const SORT_TESTUALI = new Set<SortKey>(["ragione_sociale", "codice_gestionale", "store_nome"]);

const FASCIA_LABEL: Record<string, string> = {
  tutte: "Tutte le fasce", "0_30": "1–30 giorni", "31_60": "31–60 giorni", oltre_60: "oltre 60 giorni",
};
const FASCIA_BADGE_LABEL: Record<"0_30" | "31_60" | "oltre_60", string> = {
  "0_30": "1–30gg", "31_60": "31–60gg", oltre_60: "oltre 60gg",
};
const BLOCCO_LABEL = { tutti: "Tutti", bloccati: "Solo bloccati", non_bloccati: "Solo non bloccati" } as const;
const LEGALE_LABEL = { tutti: "Tutti", in_legale: "In gestione legale", non_in_legale: "Non in gestione legale" } as const;
const AVVISATO_LABEL = {
  tutti: "Tutti", con_azioni: "Con azioni sullo scaduto attuale", senza_azioni: "Senza azioni (da contattare)",
} as const;

/** "AAAA-MM-GG" → Date locale (per celle data Excel). */
function dataExcel(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toSelRow(r: ScadRow): SelRow {
  return {
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
  };
}

function ScadenziarioPage() {
  const navigate = useNavigate();
  const { role, profilo, user, roles } = useAuth();
  const isMobile = useIsMobile();
  const puoInviare = puoInviareComunicazioniRecupero(roles as string[]);
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;
  const storeDefault = isStoreManager && myStoreId ? myStoreId : "all";
  // Filtri conservati per utente e scheda del browser (fonte unica useFiltriPagina).
  const { filtri, setCampo, reset: resetFiltriSalvati } = useFiltriPagina("scadenziario", {
    // Scelta multipla: elenco vuoto = tutti. In agenteFiltro "__none__" = cliente senza agente.
    storeId: [] as string[],
    agenteFiltro: [] as string[],
    fascia: [] as string[],
    importoMin: "",
    importoMinAScadere: "",
    situazione: "con_scaduto" as Situazione,
    statoBlocco: "tutti" as "tutti" | "bloccati" | "non_bloccati",
    statoLegale: "tutti" as "tutti" | "in_legale" | "non_in_legale",
    escludiBonifici: true,
    escludiLegale: true,
    avvisatoFilter: "tutti" as "tutti" | "con_azioni" | "senza_azioni",
    mostraACredito: false,
    nettoCoperture: false,
    // Sezione "Per punto vendita": "auto" = aperta su desktop, chiusa su telefono.
    perStoreAperto: "auto" as "auto" | "si" | "no",
    search: "",
    page: 1,
    sortBy: "tot_scaduto" as SortKey,
    sortDir: "desc" as "asc" | "desc",
  }, {
    userId: user?.id,
    // Formato vecchio (stringa singola) scartato: si riparte dal default.
    valida: {
      storeId: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
      agenteFiltro: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
      fascia: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
    },
  });
  // Store manager: sempre il proprio negozio, qualunque valore sia salvato (anche se il profilo arriva dopo).
  const storeId: string[] = isStoreManager ? (myStoreId ? [myStoreId] : []) : filtri.storeId;
  const { agenteFiltro, fascia, importoMin, importoMinAScadere, situazione, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, mostraACredito, nettoCoperture, search, page, sortBy, sortDir } = filtri;
  const setStoreId = (v: string[]) => setCampo("storeId", v);
  const setAgenteFiltro = (v: string[]) => setCampo("agenteFiltro", v);
  const setFascia = (v: string[]) => setCampo("fascia", v);
  const setImportoMin = (v: string) => setCampo("importoMin", v);
  const setImportoMinAScadere = (v: string) => setCampo("importoMinAScadere", v);
  const setSituazione = (v: Situazione) => setCampo("situazione", v);
  const setStatoBlocco = (v: typeof statoBlocco) => setCampo("statoBlocco", v);
  const setStatoLegale = (v: typeof statoLegale) => setCampo("statoLegale", v);
  const setEscludiBonifici = (v: boolean) => setCampo("escludiBonifici", v);
  const setEscludiLegale = (v: boolean) => setCampo("escludiLegale", v);
  const setAvvisatoFilter = (v: typeof avvisatoFilter) => setCampo("avvisatoFilter", v);
  const setMostraACredito = (v: boolean) => setCampo("mostraACredito", v);
  const setNettoCoperture = (v: boolean) => setCampo("nettoCoperture", v);
  const setSearch = (v: string) => setCampo("search", v);
  const setPage = (v: number | ((p: number) => number)) => setCampo("page", v);
  const setSortBy = (v: SortKey) => setCampo("sortBy", v);
  const setSortDir = (v: "asc" | "desc") => setCampo("sortDir", v);
  // Parte già uguale alla ricerca ripristinata: nessuna attesa del debounce al rientro.
  const [searchDebounced, setSearchDebounced] = useState(() => search.trim());
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [schedaMobileId, setSchedaMobileId] = useState<string | null>(null);
  const [recuperoApertoId, setRecuperoApertoId] = useState<string | null>(null);
  useEffect(() => { setRecuperoApertoId(null); }, [expandedClienteId]);
  useEffect(() => { setRecuperoApertoId(null); }, [schedaMobileId]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invioMassivoOpen, setInvioMassivoOpen] = useState(false);
  const [loadingAllIds, setLoadingAllIds] = useState(false);
  const [avanzatiOpen, setAvanzatiOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [righeDialog, setRigheDialog] = useState<ScadRow[]>([]);
  const [loadingDialogRows, setLoadingDialogRows] = useState(false);

  // Debounce ricerca
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset selezione + pagina SOLO quando un filtro cambia davvero dopo il montaggio
  // (confronto con la firma precedente: al montaggio, anche in StrictMode, la pagina ripristinata resta).
  const firmaFiltri = JSON.stringify([storeId, agenteFiltro, fascia, importoMin, importoMinAScadere, situazione, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, mostraACredito, nettoCoperture, searchDebounced, sortBy, sortDir]);
  const firmaPrecedente = useRef(firmaFiltri);
  useEffect(() => {
    if (firmaPrecedente.current === firmaFiltri) return;
    firmaPrecedente.current = firmaFiltri;
    setSelectedIds(new Set());
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaFiltri]);

  useEffect(() => {
    if (statoLegale === "in_legale") setEscludiLegale(false);
  }, [statoLegale]);

  const annoCorrente = useMemo(() => new Date().getFullYear(), []);
  const annoPrec = annoCorrente - 1;
  const minImp = Number(importoMin) || 0;
  const minAScad = Number(importoMinAScadere) || 0;
  const avanzatiAttivi = [
    situazione !== "con_scaduto",
    agenteFiltro.length > 0,
    fascia.length > 0,
    minImp > 0,
    minAScad > 0,
    statoBlocco !== "tutti",
    statoLegale !== "tutti",
    avvisatoFilter !== "tutti",
    mostraACredito,
    !escludiBonifici,
    !escludiLegale,
  ].filter(Boolean).length;
  const filtriAttivi = [
    searchDebounced !== "",
    !isStoreManager && storeId.length > 0,
    situazione !== "con_scaduto",
    agenteFiltro.length > 0,
    fascia.length > 0,
    minImp > 0,
    minAScad > 0,
    statoBlocco !== "tutti",
    statoLegale !== "tutti",
    avvisatoFilter !== "tutti",
    mostraACredito,
    nettoCoperture,
  ].filter(Boolean).length;
  const filtriDefault = filtriAttivi === 0 && search.trim() === "" && escludiBonifici && escludiLegale;

  function resetFiltri(sit: Situazione) {
    setSearchDebounced("");
    // storeId torna a [] (tutti); per lo store manager resta comunque il suo negozio (storeDefault).
    // Ordinamento e pagina restano come prima; la pagina torna a 1 se un filtro cambia.
    resetFiltriSalvati({ situazione: sit, sortBy, sortDir, page });
  }
  const azzeraFiltri = () => resetFiltri("con_scaduto");
  // "Vedi tutto" è derivato, non uno state: si spegne da solo se l'utente cambia a mano uno dei 4 valori.
  const vediTuttoAttivo = situazione === "portafoglio" && !escludiBonifici && !escludiLegale && mostraACredito;
  const attivaVediTutto = () => {
    resetFiltri("portafoglio");
    setEscludiBonifici(false);
    setEscludiLegale(false);
    setMostraACredito(true);
  };

  const commonParams = useMemo(() => ({
    p_search: searchDebounced || null,
    p_store_ids: storeId.length > 0 ? storeId : null,
    p_fasce: fascia.length > 0 ? fascia : null,
    p_stato_blocco: statoBlocco,
    p_stato_legale: statoLegale,
    p_escludi_bonifici: escludiBonifici,
    p_escludi_legale: escludiLegale,
    p_avvisato: avvisatoFilter,
    p_importo_min: minImp,
    p_mostra_a_credito: mostraACredito,
    p_agenti: agenteFiltro.length > 0 ? agenteFiltro : null,
    p_situazione: situazione,
    p_importo_min_a_scadere: minAScad,
    p_netto_coperture: nettoCoperture,
  }), [searchDebounced, storeId, fascia, statoBlocco, statoLegale, escludiBonifici, escludiLegale, avvisatoFilter, minImp, mostraACredito, agenteFiltro, situazione, minAScad, nettoCoperture]);

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
  // Totali lordi (stessi filtri, netto spento): servono solo per "lordo X €" / "su N" a filtro acceso.
  const paramsLordo = useMemo(() => ({ ...commonParams, p_netto_coperture: false }), [commonParams]);
  // "Per punto vendita" mostra sempre tutti i negozi: senza il filtro Store (il negozio scelto resta solo evidenziato).
  const paramsPerStore = useMemo(() => ({ ...commonParams, p_store_ids: null }), [commonParams]);
  const { data: totaliLordo } = useQuery({
    queryKey: ["scadenziario-totali-v1", paramsLordo],
    enabled: nettoCoperture,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenziario_totali" as never, paramsLordo as never);
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

  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: allFilteredIdsData } = useQuery({
    queryKey: ["scadenziario-all-ids", commonParams],
    enabled: invioMassivoOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenziario_ids" as never, commonParams as never);
      if (error) throw error;
      return ((data ?? []) as unknown as { cliente_id: string }[]).map((r) => r.cliente_id);
    },
  });
  const allFilteredIds = allFilteredIdsData ?? null;

  const { data: rischioExpanded, isLoading: loadingRischio } = useRischioCliente(expandedClienteId);
  const { data: rischioMobile, isLoading: loadingRischioMobile } = useRischioCliente(schedaMobileId);


  const totalCount = Number(rows?.[0]?.total_count ?? totali?.n_clienti_totali ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  /** Stessa azione della casella in intestazione tabella. */
  const toggleTuttiFiltrati = (v: boolean) => {
    if (v) void selezionaTuttiFiltrati();
    else setSelectedIds(new Set());
  };

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

  // Tutte le righe della vista corrente (tutte le pagine), opzionalmente ristrette a un insieme di id.
  async function caricaTutteLeRighe(soloIds?: Set<string>): Promise<ScadRow[]> {
    const out: ScadRow[] = [];
    const SIZE = 500;
    for (let p = 1; p <= 1000; p++) {
      const { data, error } = await supabase.rpc("get_scadenziario_lista_paginata" as never, {
        ...commonParams,
        p_anno_corrente: annoCorrente,
        p_anno_prec: annoPrec,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_page: p,
        p_page_size: SIZE,
      } as never);
      if (error) throw error;
      const batch = (data ?? []) as unknown as ScadRow[];
      for (const r of batch) if (!soloIds || soloIds.has(r.cliente_id)) out.push(r);
      const tot = Number(batch[0]?.total_count ?? 0);
      if (batch.length < SIZE || p * SIZE >= tot) break;
      if (soloIds && out.length >= soloIds.size) break;
    }
    return out;
  }

  async function apriAzioneRecupero() {
    const inPagina = pageRows.filter((r) => selectedIds.has(r.cliente_id));
    if (inPagina.length === selectedIds.size) {
      setRigheDialog(inPagina);
      setDialogOpen(true);
      return;
    }
    setLoadingDialogRows(true);
    try {
      const tutte = await caricaTutteLeRighe(selectedIds);
      setRigheDialog(tutte);
      setDialogOpen(true);
    } catch (e) {
      toast.error("Impossibile caricare i clienti selezionati");
      console.error(e);
    } finally {
      setLoadingDialogRows(false);
    }
  }

  async function esportaExcel() {
    setExporting(true);
    try {
      const [XLSX, { scaricaWorkbook }] = await Promise.all([import("xlsx"), import("@/lib/fido-teorico-export")]);
      const righe = await caricaTutteLeRighe();
      const estrattoIl = new Date();
      const intest = [
        "Cliente", "Cod. gestionale", "Store", "Bloccato", "In legale",
        `Fatturato ${annoCorrente}`, `Fatturato ${annoPrec}`, "N. fatture scadute", "Totale scaduto",
        "N. fatture a scadere", "Totale a scadere", "Prossima scadenza", "Giorni ritardo max", "Fascia",
        "Azioni di recupero", "Promessa pagamento", "Piano di rientro",
        "Scaduto lordo", "Coperto piani", "Coperto promesse",
      ];
      const aoa: unknown[][] = [intest, ...righe.map((r) => [
        r.ragione_sociale,
        r.codice_gestionale ?? "",
        r.store_nome ?? "",
        r.bloccato ? "Sì" : Number(r.ind_blocco ?? 0) === 1 ? "Rev." : "No",
        r.in_gestione_legale ? "Sì" : "No",
        Number(r.fatturato_cur ?? 0),
        Number(r.fatturato_prec ?? 0),
        Number(r.n_scadute ?? 0),
        Number(r.tot_scaduto ?? 0),
        Number(r.n_a_scadere ?? 0),
        Number(r.tot_a_scadere ?? 0),
        dataExcel(r.prossima_scadenza),
        Number(r.max_gg_ritardo ?? 0),
        r.fascia ? FASCIA_BADGE_LABEL[r.fascia] : "",
        Number(r.avvisato_n ?? 0),
        r.ha_promessa ? dataExcel(r.data_promessa) ?? "Sì" : null,
        r.ha_piano_rientro ? "Sì" : "No",
        Number(r.tot_scaduto_lordo ?? r.tot_scaduto ?? 0),
        Number(r.coperto_piani ?? 0),
        Number(r.coperto_promesse ?? 0),
      ])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const EURO = new Set([5, 6, 8, 10, 17, 18, 19]);
      const DATE = new Set([11, 15]);
      for (let ri = 1; ri <= righe.length; ri++) {
        for (let c = 0; c < intest.length; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: ri, c })];
          if (!cell) continue;
          if (c === 1) { cell.t = "s"; cell.v = String(cell.v ?? ""); cell.z = "@"; }
          else if (EURO.has(c) && typeof cell.v === "number") cell.z = "#,##0.00";
          else if (DATE.has(c) && cell.t === "n") cell.z = "dd/mm/yyyy";
        }
      }
      ws["!cols"] = intest.map((h, i) => ({ wch: i === 0 ? 40 : Math.max(12, h.length + 2) }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: righe.length, c: intest.length - 1 } }) };

      const storeNome = storeId.length === 0 ? "Tutti gli store" : storeId.map((id) => (stores ?? []).find((s) => s.id === id)?.nome ?? id).join(", ");
      const agenteNome = agenteFiltro.length === 0 ? "Tutti gli agenti" : agenteFiltro.map((c) => c === "__none__" ? "Senza agente" : (agenti ?? []).find((a) => a.codice === c)?.descrizione ?? c).join(", ");
      const fasciaNome = fascia.length === 0 ? FASCIA_LABEL.tutte : fascia.map((f) => FASCIA_LABEL[f] ?? f).join(", ");
      const filtriAoa: unknown[][] = [
        ["Voce", "Valore"],
        ["Estrazione", estrattoIl.toLocaleString("it-IT")],
        ["Utente", [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ") || user?.email || "—"],
        ["Righe esportate", righe.length],
        ["Ricerca", searchDebounced || "—"],
        ["Situazione", SITUAZIONE_LABEL[situazione]],
        ["Store", storeNome],
        ["Agente", agenteNome],
        ["Fascia scaduto", fasciaNome],
        ["Stato blocco", BLOCCO_LABEL[statoBlocco]],
        ["Stato legale", LEGALE_LABEL[statoLegale]],
        ["Importo minimo scaduto €", minImp],
        ["Importo minimo a scadere €", minAScad],
        ["Azioni di recupero", AVVISATO_LABEL[avvisatoFilter]],
        ["Escludi BOS", escludiBonifici ? "Sì" : "No"],
        ["Escludi gestione legale", escludiLegale ? "Sì" : "No"],
        ["Mostra clienti a credito", mostraACredito ? "Sì" : "No"],
        ["Al netto di piani e promesse", nettoCoperture ? "Sì" : "No"],
        ["Ordinamento", `${SORT_LABEL[sortBy]} ${sortDir === "asc" ? "crescente" : "decrescente"}`],
      ];
      const wsF = XLSX.utils.aoa_to_sheet(filtriAoa);
      wsF["!cols"] = [{ wch: 30 }, { wch: 50 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Scadenziario");
      XLSX.utils.book_append_sheet(wb, wsF, "Filtri");
      (wb as unknown as { __grassetto: Record<number, number[]> }).__grassetto = { 1: [1], 2: [1] };
      const p2 = (n: number) => String(n).padStart(2, "0");
      const d = estrattoIl;
      scaricaWorkbook(wb, `Scadenziario_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}.xlsx`);
      toast.success(`Esportate ${righe.length} righe`);
    } catch (e) {
      toast.error("Esportazione non riuscita");
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  function ordinaPer(k: SortKey) {
    if (sortBy === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(k); setSortDir(SORT_TESTUALI.has(k) ? "asc" : "desc"); }
  }

  function sortHead(k: SortKey, label: string, right = false) {
    const attivo = sortBy === k;
    return (
      <TableHead className={right ? "text-right" : undefined}>
        <button
          type="button"
          onClick={() => ordinaPer(k)}
          className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "flex-row-reverse" : ""} ${attivo ? "text-foreground font-semibold" : ""}`}
        >
          <span>{label}</span>
          {attivo && (sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
        </button>
      </TableHead>
    );
  }

  function apriCliente(id: string) {
    navigate({ to: "/clienti/$clienteId", params: { clienteId: id }, search: { tab: "insoluti", insolutiTab: "scadenziario" } as never });
  }

  async function selezionaTuttiFiltrati() {
    setLoadingAllIds(true);
    try {
      const { data, error } = await supabase.rpc("get_scadenziario_ids" as never, commonParams as never);
      if (error) throw error;
      const ids = ((data ?? []) as unknown as { cliente_id: string }[]).map((r) => r.cliente_id);
      setSelectedIds(new Set(ids));
    } catch (e) {
      toast.error("Impossibile selezionare tutti i clienti filtrati");
      console.error(e);
    } finally {
      setLoadingAllIds(false);
    }
  }

  const pageRows = rows ?? [];
  // Stadio di sollecito dei clienti della pagina: UNA chiamata alla fonte unica.
  const idsPagina = pageRows.map((r) => r.cliente_id);
  const { data: stadiPagina } = useQuery({
    queryKey: ["scadenziario-stadi-sollecito", idsPagina.join(",")],
    enabled: idsPagina.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stadio_sollecito_clienti", { _cliente_ids: idsPagina });
      if (error) throw error;
      const m = new Map<string, StadioSollecito>();
      for (const r of (data ?? []) as unknown as StadioSollecito[]) m.set(r.cliente_id, r);
      return m;
    },
  });
  const badgeStadio = (cid: string) => {
    const st = stadiPagina?.get(cid);
    return <StadioSollecitoBadgeCompatto stadio={st?.stadio ?? 0} data={st?.stadio_data ?? null} giorni={st?.stadio_giorni ?? null} />;
  };
  const schedaMobile = pageRows.find((r) => r.cliente_id === schedaMobileId);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <CalendarClock className="size-6 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Scadenziario</h1>
          <p className="text-sm text-muted-foreground">Clienti con scadenze aperte — scaduto e a scadere</p>
        </div>
      </header>

      {/* Dashboard compatta */}
      <section id="scadenziario-dashboard" className="space-y-2 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold uppercase text-foreground">Situazione</h2>
            {nettoCoperture && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[11px]">al netto di piani e promesse</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 min-h-10">
            <Switch id="netto-coperture" checked={nettoCoperture} onCheckedChange={setNettoCoperture} />
            <Label htmlFor="netto-coperture" className="text-sm cursor-pointer">Al netto di piani e promesse</Label>
          </div>
        </div>
        <ScadenziarioKpi
          kpi={kpi}
          mostraACredito={mostraACredito}
          netto={nettoCoperture}
          lordo={nettoCoperture && totaliLordo ? {
            totScad: Number(totaliLordo.tot_scaduto ?? 0),
            clientiScad: Number(totaliLordo.n_clienti_scaduti ?? 0),
            totCrediti: Number(totaliLordo.tot_crediti ?? 0),
          } : null}
        />
        {/* Riquadro "Coperture" solo con il filtro "al netto" acceso: montandolo solo
            qui, la query get_previsione_incassi_coperture non parte a filtro spento. */}
        {nettoCoperture && totali && (
          <CopertureScadenziario
            storeId={commonParams.p_store_ids}
            agente={commonParams.p_agenti}
            totali={{
              totCopertoPiani: Number(totali.tot_coperto_piani ?? 0),
              totCopertoPromesse: Number(totali.tot_coperto_promesse ?? 0),
              nClientiPiani: Number(totali.n_clienti_coperti_piani ?? 0),
              nClientiPromesse: Number(totali.n_clienti_coperti_promesse ?? 0),
              nDaVerificare: Number(totali.n_promesse_da_verificare ?? 0),
            }}
          />
        )}
        <ScadenziarioPerStore
          params={paramsPerStore}
          aperto={filtri.perStoreAperto === "auto" ? !isMobile : filtri.perStoreAperto === "si"}
          onToggle={() => setCampo("perStoreAperto", (filtri.perStoreAperto === "auto" ? !isMobile : filtri.perStoreAperto === "si") ? "no" : "si")}
          storeSelezionato={storeId}
          cliccabile={!isStoreManager}
          onMostraTutti={() => setStoreId([])}
          onSelezionaStore={(id) => {
            setStoreId(storeId.includes(id) ? storeId.filter((x) => x !== id) : [...storeId, id]);
            document.getElementById("scadenziario-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </section>
      {mostraACredito && kpi.nCrediti > 0 && (
        <p className="text-xs text-muted-foreground -mt-2">
          Scomposizione totale scaduto: <span className="font-medium text-foreground">{fmtEuro(kpi.totScad)}</span> (debitori)
          {" − "}<span className="font-medium text-emerald-700 dark:text-emerald-400">{fmtEuro(Math.abs(kpi.totCrediti))}</span> (note di credito)
          {" = "}<span className="font-semibold text-foreground">{fmtEuro(kpi.totScad + kpi.totCrediti)}</span> netto
        </p>
      )}

      {/* Filtri */}
      <Card className="p-4">
        <FiltriCollassabili attivi={filtriAttivi}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Cerca cliente</label>
              <Input className="mt-1" placeholder="Ragione sociale o codice gestionale" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {!isStoreManager && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Store</label>
                <FiltroMultiplo
                  etichetta="Store" testoTutti="Tutti gli store" className="mt-1 h-10"
                  opzioni={(stores ?? []).map((s) => ({ valore: s.id, label: s.nome }))}
                  selezionati={storeId} onChange={setStoreId}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Situazione</label>
              <Select value={situazione} onValueChange={(v) => setSituazione(v as Situazione)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SITUAZIONE_LABEL) as Situazione[]).map((k) => (
                    <SelectItem key={k} value={k}>{SITUAZIONE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={avanzatiOpen ? "secondary" : "outline"} className="h-10 gap-1.5" onClick={() => setAvanzatiOpen((v) => !v)}>
              <SlidersHorizontal className="size-4" /> Filtri avanzati
              {avanzatiAttivi > 0 && <Badge className="ml-1 h-5 px-1.5">{avanzatiAttivi}</Badge>}
              {avanzatiOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
            {!filtriDefault && (
              <Button type="button" size="sm" variant="ghost" className="h-10 gap-1.5" onClick={azzeraFiltri}>
                <RotateCcw className="size-4" /> Azzera filtri
              </Button>
            )}
          </div>

          <div className="md:hidden">
            <label className="text-xs font-medium text-muted-foreground">Ordina per</label>
            <Select value={`${sortBy}:${sortDir}`} onValueChange={(v) => { const [b, d] = v.split(":"); setSortBy(b as SortKey); setSortDir(d as "asc" | "desc"); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                  <SelectItem key={`${k}:asc`} value={`${k}:asc`}>{SORT_LABEL[k]} ↑</SelectItem>,
                  <SelectItem key={`${k}:desc`} value={`${k}:desc`}>{SORT_LABEL[k]} ↓</SelectItem>,
                ])}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={avanzatiOpen} onOpenChange={setAvanzatiOpen}>
            <CollapsibleContent className="space-y-4 pt-3 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Agente</label>
                  <FiltroMultiplo
                    etichetta="Agente" testoTutti="Tutti gli agenti" cercabile className="mt-1 h-10"
                    opzioni={[{ valore: "__none__", label: "Senza agente" }, ...(agenti ?? []).map((a) => ({ valore: a.codice, label: a.descrizione }))]}
                    selezionati={agenteFiltro} onChange={setAgenteFiltro}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Fascia scaduto</label>
                  <FiltroMultiplo
                    etichetta="Fascia scaduto" testoTutti="Tutte le fasce" className="mt-1 h-10"
                    opzioni={Object.entries(FASCIA_LABEL).filter(([k]) => k !== "tutte").map(([k, l]) => ({ valore: k, label: l }))}
                    selezionati={fascia} onChange={setFascia}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Stato blocco</label>
                  <Select value={statoBlocco} onValueChange={(v) => setStatoBlocco(v as typeof statoBlocco)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(BLOCCO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Stato legale</label>
                  <Select value={statoLegale} onValueChange={(v) => setStatoLegale(v as typeof statoLegale)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEGALE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Importo minimo scaduto €</label>
                  <Input className="mt-1" type="number" inputMode="numeric" value={importoMin} onChange={(e) => setImportoMin(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Importo minimo a scadere €</label>
                  <Input className="mt-1" type="number" inputMode="numeric" value={importoMinAScadere} onChange={(e) => setImportoMinAScadere(e.target.value)} placeholder="0" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Azioni di recupero</label>
                  <Select value={avvisatoFilter} onValueChange={(v) => setAvvisatoFilter(v as typeof avvisatoFilter)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AVVISATO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
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
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
                <div className="flex items-start gap-2 min-w-0">
                  <Switch
                    id="vedi-tutto"
                    checked={vediTuttoAttivo}
                    onCheckedChange={(v) => { if (v) attivaVediTutto(); else azzeraFiltri(); }}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <Label htmlFor="vedi-tutto" className="text-sm cursor-pointer">Vedi tutto</Label>
                    <p className="text-xs text-muted-foreground">Tutto il portafoglio clienti, anche senza scadenze aperte, inclusi BOS, gestione legale e clienti a credito</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-10 gap-1.5 shrink-0" onClick={() => void esportaExcel()} disabled={exporting}>
                  {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Esporta Excel
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        </FiltriCollassabili>
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
            <Button size="sm" onClick={() => void apriAzioneRecupero()} disabled={loadingDialogRows}>
              {loadingDialogRows ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} Avvia azione di recupero
            </Button>
          </div>
        </Card>
      )}

      {/* TABELLA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase text-foreground flex items-center gap-2">
            <FileText className="size-4" /> {situazione === "portafoglio" ? "Portafoglio clienti" : "Clienti con scadenze aperte"} ({totalCount})
          </h2>
          {puoInviare && (
            <Button size="sm" variant="outline" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5">
              <Mail className="size-4" /> Invio massivo solleciti
            </Button>
          )}
        </div>
        {isLoading && pageRows.length === 0 ? <Skeleton className="h-40" /> : pageRows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nessun cliente con scadenze aperte</Card>
        ) : (
          <Card>
            <div className="md:hidden p-3">
              <ElencoSchede
                selezioneTutti={{
                  tutti: selectedIds.size > 0 && selectedIds.size >= totalCount,
                  alcuni: selectedIds.size > 0,
                  onChange: toggleTuttiFiltrati,
                  etichetta: `Seleziona tutti i filtrati (${totalCount.toLocaleString("it-IT")})`,
                }}
              >
                {pageRows.map((r) => {
                  const totScad = Number(r.tot_scaduto ?? 0);
                  const totAScad = Number(r.tot_a_scadere ?? 0);
                  return (
                    <SchedaLista
                      key={r.cliente_id}
                      onClick={() => setSchedaMobileId(r.cliente_id)}
                      colonneCampi={2}
                      selezione={{
                        checked: selectedIds.has(r.cliente_id),
                        onChange: (v) => {
                          const next = new Set(selectedIds);
                          if (v) next.add(r.cliente_id); else next.delete(r.cliente_id);
                          setSelectedIds(next);
                        },
                      }}
                      titolo={r.ragione_sociale}
                      badge={fasciaBadge(r.fascia)}
                      campi={[
                        { etichetta: "Scaduto", valore: (
                          <span className={`tabular-nums font-semibold ${totScad < 0 ? "text-emerald-700 dark:text-emerald-400" : totScad > 0 ? "text-destructive" : ""}`}>
                            {totScad !== 0 ? fmtEuro(totScad) : "—"}
                            <DettaglioCoperturaRiga lordo={Number(r.tot_scaduto_lordo ?? totScad)} piani={Number(r.coperto_piani ?? 0)} promesse={Number(r.coperto_promesse ?? 0)} netto={nettoCoperture} />
                          </span>
                        ) },
                        { etichetta: "A scadere", valore: <span className="tabular-nums">{totAScad > 0 ? fmtEuro(totAScad) : "—"}</span> },
                        { etichetta: "N. scadute", valore: r.n_scadute || "—" },
                        { etichetta: "Prossima", valore: fmtDate(r.prossima_scadenza) },
                        { etichetta: "Store", valore: r.store_nome ?? "—" },
                        { etichetta: "Cod.", valore: r.codice_gestionale ?? "—" },
                      ]}
                      footer={
                        <>
                          {blockBadge(r)}
                          {legaleBadge(r)}
                          {(stadiPagina?.get(r.cliente_id)?.stadio ?? 0) > 0 && badgeStadio(r.cliente_id)}
                          {totScad < 0 && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">A credito</Badge>}
                          {r.ha_promessa && <Badge variant="outline" className="text-orange-600 border-orange-300">Promessa</Badge>}
                          {r.ha_piano_rientro && <Badge variant="outline" className="text-emerald-600 border-emerald-300">Piano rientro</Badge>}
                        </>
                      }
                    />
                  );
                })}
              </ElencoSchede>
            </div>
            <div className="hidden md:block">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Seleziona tutti i clienti filtrati"
                      checked={
                        selectedIds.size > 0 && selectedIds.size >= totalCount
                          ? true
                          : selectedIds.size > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={(v) => toggleTuttiFiltrati(v === true)}
                    />
                  </TableHead>
                  <TableHead className="w-8 text-center px-1">Az.</TableHead>
                  {sortHead("ragione_sociale", "Cliente")}
                  {sortHead("codice_gestionale", "Cod. Gestionale")}
                  {sortHead("store_nome", "Store")}
                  {sortHead("bloccato", "Stato blocco")}
                  <TableHead>Legale</TableHead>
                  <TableHead>Sollecito</TableHead>
                  {sortHead("fatturato_cur", `Fatt. ${annoCorrente} (IVA escl.)`, true)}
                  {sortHead("fatturato_prec", `Fatt. ${annoPrec} (IVA escl.)`, true)}
                  {sortHead("n_scadute", "N. Fatt. scadute", true)}
                  {sortHead("tot_scaduto", "Totale scaduto", true)}
                  {sortHead("n_a_scadere", "N. Fatt. a scadere", true)}
                  {sortHead("tot_a_scadere", "Totale a scadere", true)}
                  {sortHead("prossima_scadenza", "Prossima scad.")}
                  {sortHead("max_gg", "Fascia")}
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
                            {r.ha_promessa && <PromessaIcon clienteId={r.cliente_id} dataPromessa={r.data_promessa} />}
                            {r.ha_piano_rientro && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex items-center text-emerald-600 dark:text-emerald-400 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate({
                                        to: "/clienti/$clienteId",
                                        params: { clienteId: r.cliente_id },
                                        search: { tab: "insoluti", insolutiTab: "piani" } as never,
                                      });
                                    }}
                                  >
                                    <CalendarClock className="size-4" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Piano di rientro attivo — {r.piano_rate_pagate ?? 0}/{r.piano_rate_totali ?? 0} rate pagate
                                  {r.piano_prossima_rata_data ? ` · prossima ${fmtDate(r.piano_prossima_rata_data)} (${fmtEuro(r.piano_prossima_rata_importo)})` : ""}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.codice_gestionale ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.store_nome ?? "—"}</TableCell>
                        <TableCell>{blockBadge(r)}</TableCell>
                        <TableCell>{legaleBadge(r)}</TableCell>
                        <TableCell>{badgeStadio(r.cliente_id)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fattCur > 0 ? fmtEuro(fattCur) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fattPrev > 0 ? fmtEuro(fattPrev) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.n_scadute || "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${totScad < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                          {totScad !== 0 ? fmtEuro(totScad) : "—"}
                          <DettaglioCoperturaRiga lordo={Number(r.tot_scaduto_lordo ?? totScad)} piani={Number(r.coperto_piani ?? 0)} promesse={Number(r.coperto_promesse ?? 0)} netto={nettoCoperture} />
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
                          <TableCell colSpan={17} className="px-4 py-3 space-y-3 whitespace-normal" onClick={(e) => e.stopPropagation()}>
                            {r.ha_promessa && <PromesseAttiveBlock clienteId={r.cliente_id} />}
                            <ExpandedRischioPanel
                              loading={loadingRischio}
                              data={rischioExpanded}
                              clienteId={r.cliente_id}
                              onApri={(e: React.MouseEvent) => { e.stopPropagation(); apriCliente(r.cliente_id); }}
                            />
                            <div className="pt-3 border-t">
                              <RecuperoStriscia
                                clienteId={r.cliente_id}
                                pianoRientro={r.ha_piano_rientro ? { pagate: r.piano_rate_pagate ?? 0, totali: r.piano_rate_totali ?? 0 } : null}
                                aperto={recuperoApertoId === r.cliente_id}
                                onToggle={() => setRecuperoApertoId(recuperoApertoId === r.cliente_id ? null : r.cliente_id)}
                              />
                            </div>
                            {recuperoApertoId === r.cliente_id && (
                              <ClienteAttivitaRecuperoTab
                                clienteId={r.cliente_id}
                                onApriScheda={() => navigate({
                                  to: "/clienti/$clienteId",
                                  params: { clienteId: r.cliente_id },
                                  search: { tab: "attivita" } as never,
                                })}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>

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

      <Sheet open={!!schedaMobileId} onOpenChange={(v) => { if (!v) setSchedaMobileId(null); }}>
        <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto p-4">
          {schedaMobile && (
            <div className="min-w-0 space-y-3">
              <SheetHeader className="min-w-0 pr-8 text-left">
                <SheetTitle className="break-words">{schedaMobile.ragione_sociale}</SheetTitle>
                <SheetDescription className="break-words">
                  {schedaMobile.codice_gestionale ?? "—"} · {schedaMobile.store_nome ?? "—"}
                </SheetDescription>
                <div className="flex flex-wrap items-center gap-2">
                  {blockBadge(schedaMobile)}
                  {legaleBadge(schedaMobile)}
                  {fasciaBadge(schedaMobile.fascia)}
                </div>
              </SheetHeader>
              {schedaMobile.ha_promessa && <PromesseAttiveBlock clienteId={schedaMobile.cliente_id} />}
              <ExpandedRischioPanel
                loading={loadingRischioMobile}
                data={rischioMobile}
                clienteId={schedaMobile.cliente_id}
                onApri={(e) => { e.stopPropagation(); apriCliente(schedaMobile.cliente_id); }}
              />
              <div className="pt-3 border-t">
                <RecuperoStriscia
                  clienteId={schedaMobile.cliente_id}
                  pianoRientro={schedaMobile.ha_piano_rientro ? { pagate: schedaMobile.piano_rate_pagate ?? 0, totali: schedaMobile.piano_rate_totali ?? 0 } : null}
                  aperto={recuperoApertoId === schedaMobile.cliente_id}
                  onToggle={() => setRecuperoApertoId(recuperoApertoId === schedaMobile.cliente_id ? null : schedaMobile.cliente_id)}
                />
              </div>
              {recuperoApertoId === schedaMobile.cliente_id && (
                <ClienteAttivitaRecuperoTab
                  clienteId={schedaMobile.cliente_id}
                  onApriScheda={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: schedaMobile.cliente_id },
                    search: { tab: "attivita" } as never,
                  })}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AzioneRecuperoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedRows={righeDialog.map(toSelRow)}
        userId={user?.id ?? null}
        onDone={() => { setSelectedIds(new Set()); setDialogOpen(false); }}
      />

      <InvioMassivoDialog
        open={invioMassivoOpen}
        onOpenChange={setInvioMassivoOpen}
        clienteIdsSelezionati={Array.from(selectedIds)}
        clienteIdsFiltrati={allFilteredIds ?? Array.from(selectedIds)}
      />
    </div>
    </TooltipProvider>
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
  condizione_pagamento_cod?: string | null; condizione_pagamento_desc_db?: string | null;
  codice_agente?: string | null; agente?: string | null;
} | null | undefined;

function fmtDataOra(v: string): string {
  return new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function RecuperoStriscia({ clienteId, pianoRientro, aperto, onToggle }: {
  clienteId: string;
  pianoRientro: { pagate: number; totali: number } | null;
  aperto: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const { azioni, isLoading, dataUpdatedAt, daFare, prossima, ultimaFatta, inRitardo } = useAzioniRecuperoCliente(clienteId);
  // Stessa query (e chiave) del tab attività: nessun caricamento aggiuntivo.
  const { data: operatori } = useOperatoriAttivita();
  // Stadio di sollecito del cliente: hook condiviso col tab attività (stessa chiave).
  const { data: stadioRow, isLoading: stadioLoading } = useStadioSollecitoCliente(clienteId);
  const nomeOperatore = (id: string | null) => {
    if (!id) return null;
    const o = (operatori ?? []).find((x) => x.id === id);
    if (!o) return null;
    return `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || null;
  };

  // Allineamento riga: se le azioni cambiano dopo il primo caricamento, ricarica lista e totali.
  const primoAggiornamento = useRef<number | null>(null);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    if (primoAggiornamento.current === null) { primoAggiornamento.current = dataUpdatedAt; return; }
    if (dataUpdatedAt !== primoAggiornamento.current) {
      primoAggiornamento.current = dataUpdatedAt;
      void qc.invalidateQueries({ queryKey: ["scadenziario-paginata-v1"] });
      void qc.invalidateQueries({ queryKey: ["scadenziario-totali-v1"] });
      void qc.invalidateQueries({ queryKey: ["recupero-stadio-cliente", clienteId] });
      void qc.invalidateQueries({ queryKey: ["scadenziario-stadi-sollecito"] });
    }
  }, [dataUpdatedAt, qc, clienteId]);

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  const UltimaIcon = ultimaFatta ? (TIPO_AZIONE_ICON[tipoAzioneVisualizzato(ultimaFatta)] ?? FileText) : null;
  const operatore = ultimaFatta ? nomeOperatore(ultimaFatta.operatore_id) : null;
  const testoUltima = ultimaFatta ? testoAzione(ultimaFatta) : null;
  const testoProssima = prossima ? testoAzione(prossima) : null;

  return (
    <div className="border rounded-md p-3 bg-background space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Ultima azione fatta</div>
          {ultimaFatta && UltimaIcon ? (
            <div className="text-sm break-words">
              <div className="font-medium flex items-center gap-1.5"><UltimaIcon className="size-4 shrink-0" />{TIPO_AZIONE_LABEL[tipoAzioneVisualizzato(ultimaFatta)] ?? ultimaFatta.tipo}</div>
              <div className="text-muted-foreground">{fmtDataOra(ultimaFatta.data_azione)}{operatore ? ` · ${operatore}` : ""}</div>
              {testoUltima && (
                <p className="mt-1 whitespace-pre-wrap break-words line-clamp-3" title={testoUltima}>{testoUltima}</p>
              )}
            </div>
          ) : <div className="text-sm text-muted-foreground">Nessuna azione</div>}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Prossima pianificata</div>
          {prossima ? (
            <div className={`text-sm break-words ${inRitardo ? "text-destructive" : ""}`}>
              <div className="font-medium flex flex-wrap items-center gap-1.5">
                {TIPO_AZIONE_LABEL[tipoAzioneVisualizzato(prossima)] ?? prossima.tipo}
                {inRitardo && <Badge variant="destructive">In ritardo</Badge>}
              </div>
              <div>{fmtDataOra(prossima.data_azione)}</div>
              {testoProssima && (
                <p className="mt-1 whitespace-pre-wrap break-words line-clamp-2" title={testoProssima}>{testoProssima}</p>
              )}
            </div>
          ) : <div className="text-sm text-muted-foreground">—</div>}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Azioni</div>
          <div className="text-sm font-medium tabular-nums">{azioni?.length ?? 0} totali · {daFare.length} da fare</div>
          {!stadioLoading && (
            <div className="mt-1">
              <StadioSollecitoBadge
                stadio={stadioRow?.stadio_sollecito ?? 0}
                data={stadioRow?.stadio_data ?? null}
                giorni={stadioRow?.stadio_giorni ?? null}
              />
            </div>
          )}
          {pianoRientro && (
            <Badge variant="outline" className="mt-1 text-emerald-600 border-emerald-300">
              Piano di rientro {pianoRientro.pagate}/{pianoRientro.totali}
            </Badge>
          )}
        </div>
        <div className="min-w-0 flex flex-col items-start gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 min-h-10 max-w-full h-auto whitespace-normal text-left" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {aperto ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
            {aperto ? "Nascondi recupero crediti" : "Mostra recupero crediti"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PromesseAttiveBlock({ clienteId }: { clienteId: string }) {
  const { data } = useQuery({
    queryKey: ["promesse-attive-scadenziario", clienteId],
    queryFn: async () => {
      const oggi = new Date();
      oggi.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("azioni_recupero")
        .select("id, data_promessa_pagamento, importo_riferimento, note")
        .eq("cliente_id", clienteId)
        .eq("tipo", TIPO_PROMESSA)
        .gte("data_promessa_pagamento", oggi.toISOString().slice(0, 10))
        .order("data_promessa_pagamento", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2">
        <HandCoins className="size-4" />
        {data.length === 1 ? "Promessa di pagamento" : `${data.length} promesse di pagamento`}
      </div>
      <ul className="space-y-1 text-sm">
        {data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {p.importo_riferimento != null
                ? fmtEuro(Number(p.importo_riferimento))
                : "Importo non indicato"}
            </span>
            <span className="text-muted-foreground">
              entro il {fmtDate(p.data_promessa_pagamento)}
            </span>
            {p.note && <span className="text-xs text-muted-foreground italic">— {p.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}


function ExpandedRischioPanel({ loading, data, onApri, clienteId }: { loading: boolean; data: RischioData; onApri: (e: React.MouseEvent) => void; clienteId: string }) {
  // Montato solo con la riga espansa: la query parte solo allora.
  const { data: esp } = useEsperienzaPagamentoCliente(clienteId);
  const pr = testiPagateInRitardo(esp);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-sm">
        <CellInfo label="Insoluti storici" value={ni == null ? "—" : String(ni)} cls={ni != null && Number(ni) > 0 ? "text-destructive font-medium" : ""} />
        {/* Sotto lg: riga intera in fondo (niente cella orfana); da lg subito dopo Insoluti. */}
        <div className="min-w-0 col-span-2 sm:col-span-4 lg:col-span-1 order-last lg:order-none" title={pr.titolo}>
          <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{pr.label}</p>
          <p className={`tabular-nums break-words ${pr.inRitardo ? "text-destructive font-medium" : ""}`}>{pr.valore}</p>
          {pr.dettaglio && <p className="text-[11px] text-muted-foreground break-words">{pr.dettaglio}</p>}
        </div>
        <CellInfo label="Effetti a rischio" value={fmtEuro(eff)} cls={eff > 0 ? "text-orange-600 font-medium" : ""} />
        <CellInfo label="Dilaz. concordata" value={d.dilazione_concordata != null ? `${d.dilazione_concordata} gg` : "—"} />
        <CellInfo label="Ritardo medio" value={r.text} cls={r.cls} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 text-sm">
        <CellInfo
          label="Condizione pagamento"
          value={
            d.condizione_pagamento_cod
              ? d.condizione_pagamento_desc_db
                ? `${d.condizione_pagamento_cod} — ${d.condizione_pagamento_desc_db}`
                : d.condizione_pagamento_cod
              : "—"
          }
        />
        <CellInfo
          label="Agente"
          value={
            d.codice_agente && d.agente
              ? `${d.codice_agente} — ${d.agente}`
              : "—"
          }
        />
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
  const intestazione = `${info!.n_azioni} azion${info!.n_azioni === 1 ? "e" : "i"} sullo scaduto attuale`;

  return (
    <TooltipAzioneRecupero
      criterio={{ clienteId: info!.cliente_id, tipo: info!.ultima_tipo, data: info!.ultima_data }}
      intestazione={intestazione}
      etichetta="Ultima"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={intestazione}
        className={`inline-flex items-center justify-center rounded p-1 hover:bg-muted transition-colors ${colorClass}`}
      >
        <Icon className="size-5" strokeWidth={2.5} />
      </button>
    </TooltipAzioneRecupero>
  );
}

function PromessaIcon({ clienteId, dataPromessa }: { clienteId: string; dataPromessa: string | null | undefined }) {
  return (
    <TooltipAzioneRecupero criterio={{ clienteId, promessaData: dataPromessa ?? null }}>
      <span className="inline-flex items-center text-orange-600" onClick={(e) => e.stopPropagation()}>
        <HandCoins className="size-4" />
      </span>
    </TooltipAzioneRecupero>
  );
}

function CellInfo({ label, value, cls, hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{label}</p>
      <p className={`tabular-nums break-words ${cls ?? ""}`}>{value}{hint && <span className="text-[10px] text-muted-foreground ml-1">{hint}</span>}</p>
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
  const { roles } = useAuth();
  const tipiAzione = (["email", "telefonata", "promemoria"] as const).filter((t) => tipoAzioneConsentito(roles, t));
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
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)} className={`grid grid-cols-1 gap-2 ${tipiAzione.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              {tipiAzione.map((t) => (
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
              Viene creata un'email da inviare per ogni cliente: la trovi in Attività recupero e nel Calendario, con il pulsante Invia ora.
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
