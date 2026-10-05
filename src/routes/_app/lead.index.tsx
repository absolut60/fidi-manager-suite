import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Users, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, X, CalendarClock, ArrowRightLeft,
} from "lucide-react";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NuovoLeadDialog } from "@/components/lead/nuovo-lead-dialog";
import { useCategorieSegmento } from "@/lib/use-categorie-segmento";
import {
  LEAD_STATI, LEAD_STATO_LABEL, LEAD_STATO_CLASS,
  LEAD_TIPI, LEAD_TIPO_LABEL, LEAD_FONTI, LEAD_FONTE_LABEL,
  LEAD_PRIORITA, LEAD_PRIORITA_LABEL, LEAD_PRIORITA_CLASS,
  nomeLead, formatData, puoAccedereLead, puoGestireLead,
  LEAD_AMBITI, LEAD_AMBITO_LABEL, type LeadAmbito,
} from "@/lib/lead-costanti";

export const Route = createFileRoute("/_app/lead/")({
  component: LeadListaPage,
});

const TUTTI = "tutti";
const NESSUNO = "__none__";

type Vista = "attivi" | "ricontattare" | "convertiti" | "persi";

/** Stati esclusi dalla vista di lavoro "Attivi". */
const STATI_NON_ATTIVI = ["convertito", "perso"] as const;

type LeadRow = {
  id: string;
  ragione_sociale: string | null;
  nome: string | null;
  cognome: string | null;
  tipo_soggetto: string | null;
  stato: (typeof LEAD_STATI)[number];
  tipo_lead: (typeof LEAD_TIPI)[number];
  priorita: (typeof LEAD_PRIORITA)[number];
  fonte: (typeof LEAD_FONTI)[number];
  citta: string | null;
  provincia: string | null;
  store_id: string | null;
  agente_codice: string | null;
  assegnato_a: string | null;
  prossima_azione_il: string | null;
  created_at: string;
  conversione_tipo: string | null;
  cliente_id: string | null;
  convertito_il: string | null;
  cliente?: { id: string; ragione_sociale: string | null } | null;
};

// La query supabase cambia tipo in base al select: i filtri sono applicati in modo
// strutturale e il tipo originale viene restituito invariato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryLibera = any;

/** Elenco multiplo con eventuale "__none__" → .in / .is null / .or(in, is null). */
function filtroMultiplo(q: QueryLibera, col: string, valori: string[]): QueryLibera {
  if (valori.length === 0) return q;
  const veri = valori.filter((v) => v !== NESSUNO);
  const conNull = veri.length !== valori.length;
  if (!conNull) return q.in(col, veri);
  if (veri.length === 0) return q.is(col, null);
  return q.or(`${col}.in.(${veri.join(",")}),${col}.is.null`);
}

const BLOCCO_SPOSTA = 200;
const BLOCCO_ID = 1000;

function LeadListaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);
  const canManage = useMemo(() => puoGestireLead(roles as string[]), [roles]);

  const [ambito, setAmbito] = useState<LeadAmbito>("commerciale");
  const [tab, setTab] = useState<Vista>("attivi");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stato, setStato] = useState<string[]>([]);
  const [tipoLead, setTipoLead] = useState(TUTTI);
  const [fonte, setFonte] = useState(TUTTI);
  const [priorita, setPriorita] = useState(TUTTI);
  const [mestiere, setMestiere] = useState(TUTTI);
  const [storeFiltro, setStoreFiltro] = useState<string[]>([]);
  const [agente, setAgente] = useState<string[]>([]);
  const [assegnatario, setAssegnatario] = useState<string[]>([]);
  const [evento, setEvento] = useState(TUTTI);
  const [giorni, setGiorni] = useState("0");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [caricandoTutti, setCaricandoTutti] = useState(false);
  const [confermaSposta, setConfermaSposta] = useState(false);
  const [spostando, setSpostando] = useState(false);
  const ambitoDestinazione: LeadAmbito = ambito === "eventi" ? "commerciale" : "eventi";


  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });
  const { data: profili } = useQuery({
    queryKey: ["utenti-assegnabili"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_utenti_assegnabili");
      return (data ?? []) as { id: string; nome: string | null; cognome: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  const { data: mestieriFiltro } = useCategorieSegmento("mestiere");
  const { data: eventiNomi } = useQuery({
    queryKey: ["lead-eventi-nomi"],
    enabled: canSee && ambito === "eventi",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("eventi").select("nome").order("data_evento", { ascending: false });
      if (error) return [] as string[];
      return Array.from(new Set((data ?? []).map((e) => e.nome).filter((n): n is string => !!n?.trim())));
    },
  });

  const nomeProfilo = (id: string | null) => {
    if (!id) return "—";
    const p = profili?.find((x) => x.id === id);
    return p ? `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—" : "—";
  };
  const nomeStore = (id: string | null) => stores?.find((s) => s.id === id)?.nome ?? "—";

  const attiviCount =
    [tipoLead, fonte, priorita, mestiere, evento].filter((v) => v !== TUTTI).length +
    [stato, storeFiltro, agente, assegnatario].filter((v) => v.length > 0).length +
    (search ? 1 : 0);

  function resetFiltri() {
    setStato([]); setTipoLead(TUTTI); setFonte(TUTTI); setPriorita(TUTTI);
    setStoreFiltro([]); setAgente([]); setAssegnatario([]); setMestiere(TUTTI); setEvento(TUTTI);
    setSearch(""); setSearchInput(""); setPage(1);
  }

  function cambiaAmbito(a: LeadAmbito) {
    if (a === ambito) return;
    setAmbito(a);
    resetFiltri();
    setSelezionati(new Set());
  }

  const limiteData = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Number(giorni || 0));
    return d.toISOString().slice(0, 10);
  }, [giorni]);

  /** Il filtro Stato ha la precedenza sul set di stati di default della vista. */
  const statoEsplicito = stato.length > 0;
  /** Colonne/campi di conversione: vista Convertiti oppure filtro Stato = solo Convertito. */
  const mostraConversione =
    (stato.length === 1 && stato[0] === "convertito") || (!statoEsplicito && tab === "convertiti");

  /** FONTE UNICA dei filtri della pagina: usata dalla lista e da "Seleziona tutti i filtrati". */
  function applicaFiltri<T>(q0: T): T {
    let q = q0 as QueryLibera;
    q = q.eq("ambito", ambito);
    if (search.trim()) {
      const s = search.trim().replace(/[,()]/g, " ");
      q = q.or(
        [
          `ragione_sociale.ilike.%${s}%`,
          `nome.ilike.%${s}%`,
          `cognome.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `partita_iva.ilike.%${s}%`,
          `citta.ilike.%${s}%`,
        ].join(","),
      );
    }
    if (statoEsplicito) q = q.in("stato", stato);
    else if (tab === "convertiti") q = q.eq("stato", "convertito");
    else if (tab === "persi") q = q.eq("stato", "perso");
    else if (tab === "attivi") q = q.not("stato", "in", `(${STATI_NON_ATTIVI.join(",")})`);

    if (tipoLead !== TUTTI) q = q.eq("tipo_lead", tipoLead);
    if (fonte !== TUTTI) q = q.eq("fonte", fonte);
    if (priorita !== TUTTI) q = q.eq("priorita", priorita);
    if (mestiere !== TUTTI) {
      if (mestiere === NESSUNO) q = q.is("mestiere_id", null);
      else q = q.eq("mestiere_id", mestiere);
    }
    q = filtroMultiplo(q, "store_id", storeFiltro);
    q = filtroMultiplo(q, "agente_codice", agente);
    q = filtroMultiplo(q, "assegnato_a", assegnatario);
    if (ambito === "eventi" && evento !== TUTTI) q = q.eq("fonte_dettaglio", evento);
    if (tab === "ricontattare") {
      q = q.not("prossima_azione_il", "is", null).lte("prossima_azione_il", limiteData);
    }
    return q as T;
  }

  const queryKey = [
    "lead-lista", ambito, tab, search, stato, tipoLead, fonte, priorita, mestiere, storeFiltro, agente,
    assegnatario, evento, page, pageSize, sortBy, sortDir, tab === "ricontattare" ? limiteData : null,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: canSee,
    queryFn: async () => {
      let q = applicaFiltri(
        supabase
          .from("lead")
          .select(
            "id, ragione_sociale, nome, cognome, tipo_soggetto, stato, tipo_lead, priorita, fonte, citta, provincia, store_id, agente_codice, assegnato_a, prossima_azione_il, created_at, cliente_id, convertito_il, conversione_tipo, cliente:clienti!lead_cliente_id_fkey(id, ragione_sociale)",
            { count: "exact" },
          ),
      );

      if (tab === "ricontattare") {
        q = q.order("prossima_azione_il", { ascending: true });
      } else if (tab === "convertiti" && sortBy === "created_at") {
        q = q.order("convertito_il", { ascending: false, nullsFirst: false });
      } else {
        q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await q.range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as LeadRow[], total: count ?? 0 };
    },
  });

  /** Conteggi dei riquadri: query leggere solo di conteggio, per l'ambito corrente. */
  const { data: conteggi } = useQuery({
    queryKey: ["lead-conteggi", ambito, limiteData],
    enabled: canSee,
    queryFn: async () => {
      const base = () => supabase.from("lead").select("id", { count: "exact", head: true }).eq("ambito", ambito);
      const [attivi, ricontattare, convertiti, persi] = await Promise.all([
        base().not("stato", "in", `(${STATI_NON_ATTIVI.join(",")})`),
        base().not("prossima_azione_il", "is", null).lte("prossima_azione_il", limiteData),
        base().eq("stato", "convertito"),
        base().eq("stato", "perso"),
      ]);
      return {
        attivi: attivi.count ?? 0,
        ricontattare: ricontattare.count ?? 0,
        convertiti: convertiti.count ?? 0,
        persi: persi.count ?? 0,
      } as Record<Vista, number>;
    },
  });

  /** Lead attivi per ciascun ambito (selettore Commerciali / Da eventi). */
  const { data: attiviPerAmbito } = useQuery({
    queryKey: ["lead-conteggi", "ambiti"],
    enabled: canSee,
    queryFn: async () => {
      const res = await Promise.all(
        LEAD_AMBITI.map((a) =>
          supabase
            .from("lead")
            .select("id", { count: "exact", head: true })
            .eq("ambito", a)
            .not("stato", "in", `(${STATI_NON_ATTIVI.join(",")})`),
        ),
      );
      return Object.fromEntries(LEAD_AMBITI.map((a, i) => [a, res[i].count ?? 0])) as Record<LeadAmbito, number>;
    },
  });

  function toggleSel(id: string, v: boolean) {
    setSelezionati((prev) => {
      const n = new Set(prev);
      if (v) n.add(id); else n.delete(id);
      return n;
    });
  }

  async function selezionaTuttiFiltrati() {
    setCaricandoTutti(true);
    try {
      const ids: string[] = [];
      for (let from = 0; ; from += BLOCCO_ID) {
        const { data, error } = await applicaFiltri(supabase.from("lead").select("id"))
          .order("id")
          .range(from, from + BLOCCO_ID - 1);
        if (error) throw error;
        const blocco = (data ?? []).map((r) => r.id);
        ids.push(...blocco);
        if (blocco.length < BLOCCO_ID) break;
      }
      setSelezionati(new Set(ids));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Selezione non riuscita");
    } finally {
      setCaricandoTutti(false);
    }
  }

  async function spostaSelezionati() {
    const ids = Array.from(selezionati);
    setSpostando(true);
    let spostati = 0;
    try {
      for (let i = 0; i < ids.length; i += BLOCCO_SPOSTA) {
        const { data, error } = await supabase.rpc("sposta_lead_ambito", {
          _lead_ids: ids.slice(i, i + BLOCCO_SPOSTA),
          _ambito: ambitoDestinazione,
        });
        if (error) throw error;
        spostati += data ?? 0;
      }
      toast.success(`${spostati} lead spostati`);
      setSelezionati(new Set());
      setConfermaSposta(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Spostamento non riuscito");
    } finally {
      setSpostando(false);
      void queryClient.invalidateQueries({ queryKey: ["lead-lista"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-conteggi"] });
    }
  }


  const rows = data?.rows ?? [];
  const totale = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totale / pageSize));
  const tuttaPaginaSel = rows.length > 0 && rows.every((r) => selezionati.has(r.id));
  const qualcunoPaginaSel = rows.some((r) => selezionati.has(r.id));
  function selezionaPagina(v: boolean) {
    setSelezionati((prev) => {
      const n = new Set(prev);
      rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id)));
      return n;
    });
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }

  function SortHeader({ col, label }: { col: string; label: string }) {
    const active = sortBy === col && tab !== "ricontattare";
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="flex items-center gap-1 font-medium hover:text-primary transition-colors"
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

  const [open, setOpen] = useState(false);

  if (authLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!canSee) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione, Amministratore e Responsabile agenti.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lead</h1>
          <p className="text-sm text-muted-foreground mt-1">
            I lead sono contatti potenziali non ancora clienti. Quando un lead è pronto, potrà essere
            convertito in cliente.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 w-full sm:w-auto"><Plus className="size-4" /> Nuovo lead</Button>
          </DialogTrigger>
          <NuovoLeadDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <div className="space-y-2">
        <div
          role="radiogroup"
          aria-label="Ambito dei lead"
          className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
        >
          {LEAD_AMBITI.map((a) => (
            <Button
              key={a}
              type="button"
              role="radio"
              aria-checked={ambito === a}
              size="sm"
              variant={ambito === a ? "default" : "ghost"}
              className="min-h-10 gap-1.5"
              onClick={() => cambiaAmbito(a)}
            >
              {LEAD_AMBITO_LABEL[a]}
              <span className="text-xs opacity-70">{attiviPerAmbito?.[a] ?? "—"}</span>
            </Button>
          ))}
        </div>
        {ambito === "eventi" && (
          <p className="text-sm text-muted-foreground">
            Anagrafica nata dagli eventi: persone da reinvitare e riqualificare. Non compare nella lista commerciale.
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Vista); setPage(1); }}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="attivi" className="gap-1.5">
            Attivi <span className="text-xs opacity-70">{conteggi?.attivi ?? "—"}</span>
          </TabsTrigger>
          <TabsTrigger value="ricontattare" className="gap-1.5">
            <CalendarClock className="size-4" /> Da ricontattare
            <span className="text-xs opacity-70">{conteggi?.ricontattare ?? "—"}</span>
          </TabsTrigger>
          <TabsTrigger value="convertiti" className="gap-1.5">
            Convertiti <span className="text-xs opacity-70">{conteggi?.convertiti ?? "—"}</span>
          </TabsTrigger>
          <TabsTrigger value="persi" className="gap-1.5">
            Persi <span className="text-xs opacity-70">{conteggi?.persi ?? "—"}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {statoEsplicito && tab !== "ricontattare" && (
        <p className="text-xs text-muted-foreground -mt-3">
          Filtro Stato attivo: la lista mostra solo i lead in stato{" "}
          <strong className="text-foreground">{stato.map((s) => LEAD_STATO_LABEL[s as LeadRow["stato"]]).join(", ")}</strong>{" "}
          e ignora la vista selezionata.
        </p>
      )}

      {canManage && selezionati.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="min-w-0 text-sm font-medium">
            {selezionati.size} {selezionati.size === 1 ? "selezionato" : "selezionati"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" className="min-h-10" disabled={spostando} onClick={() => setConfermaSposta(true)}>
              <ArrowRightLeft className="size-4" />
              Sposta in {LEAD_AMBITO_LABEL[ambitoDestinazione]}
            </Button>
            <Button size="sm" variant="ghost" className="min-h-10" disabled={spostando} onClick={() => setSelezionati(new Set())}>
              Annulla selezione
            </Button>
          </div>
        </Card>
      )}

      <AlertDialog open={confermaSposta} onOpenChange={(o) => { if (!spostando) setConfermaSposta(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Spostare {selezionati.size} lead in "{LEAD_AMBITO_LABEL[ambitoDestinazione]}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {ambitoDestinazione === "commerciale"
                ? "I lead entreranno nella lista commerciale di lavoro quotidiano."
                : "I lead usciranno dalla lista commerciale e resteranno consultabili in \"Da eventi\"."}{" "}
              Lo spostamento viene registrato nello storico di ogni lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={spostando}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={spostando}
              onClick={(e) => { e.preventDefault(); void spostaSelezionati(); }}
            >
              {spostando ? "Spostamento…" : "Sposta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      <Card className="p-4 sm:p-5">
        <FiltriCollassabili
          attivi={attiviCount}
          azioni={
            <Button variant="ghost" size="sm" onClick={resetFiltri} className="gap-1 h-7">
              <X className="size-3.5" /> Azzera tutti
            </Button>
          }
        >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="lg:col-span-2">
            <Label className="text-xs">Ricerca</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Nome, email, P.IVA, città..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
                onBlur={() => { setSearch(searchInput); setPage(1); }}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Stato</Label>
            <FiltroMultiplo
              etichetta="Stato"
              opzioni={LEAD_STATI.map((s) => ({ valore: s, label: LEAD_STATO_LABEL[s] }))}
              selezionati={stato}
              onChange={(v) => { setStato(v); setPage(1); }}
            />
          </div>
          <div>
            <Label className="text-xs">Tipo lead</Label>
            <Select value={tipoLead} onValueChange={(v) => { setTipoLead(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                {LEAD_TIPI.map((s) => <SelectItem key={s} value={s}>{LEAD_TIPO_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fonte</Label>
            <Select value={fonte} onValueChange={(v) => { setFonte(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutte</SelectItem>
                {LEAD_FONTI.map((s) => <SelectItem key={s} value={s}>{LEAD_FONTE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priorità</Label>
            <Select value={priorita} onValueChange={(v) => { setPriorita(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutte</SelectItem>
                {LEAD_PRIORITA.map((s) => <SelectItem key={s} value={s}>{LEAD_PRIORITA_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mestiere</Label>
            <Select value={mestiere} onValueChange={(v) => { setMestiere(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                <SelectItem value={NESSUNO}>Senza mestiere</SelectItem>
                {(mestieriFiltro ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.parent_id ? `— ${m.label}` : m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sede</Label>
            <FiltroMultiplo
              etichetta="Sede"
              testoTutti="Tutte"
              opzioni={[{ valore: NESSUNO, label: "Senza sede" }, ...(stores ?? []).map((s) => ({ valore: s.id, label: s.nome }))]}
              selezionati={storeFiltro}
              onChange={(v) => { setStoreFiltro(v); setPage(1); }}
            />
          </div>
          {canManage && (<>
          <div>
            <Label className="text-xs">Agente</Label>
            <FiltroMultiplo
              etichetta="Agente"
              cercabile
              opzioni={[{ valore: NESSUNO, label: "Senza agente" }, ...(agenti ?? []).map((a) => ({ valore: a.codice, label: a.descrizione || a.codice }))]}
              selezionati={agente}
              onChange={(v) => { setAgente(v); setPage(1); }}
            />
          </div>
          <div>
            <Label className="text-xs">Assegnatario</Label>
            <FiltroMultiplo
              etichetta="Assegnatario"
              cercabile
              opzioni={[{ valore: NESSUNO, label: "Non assegnati" }, ...(profili ?? []).map((p) => ({ valore: p.id, label: `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || p.id }))]}
              selezionati={assegnatario}
              onChange={(v) => { setAssegnatario(v); setPage(1); }}
            />
          </div>
          </>)}
          {ambito === "eventi" && (eventiNomi?.length ?? 0) > 0 && (
            <div>
              <Label className="text-xs">Evento</Label>
              <Select value={evento} onValueChange={(v) => { setEvento(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>Tutti</SelectItem>
                  {(eventiNomi ?? []).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {tab === "ricontattare" && (
            <div>
              <Label className="text-xs">Finestra</Label>
              <Select value={giorni} onValueChange={(v) => { setGiorni(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Scaduti / oggi</SelectItem>
                  <SelectItem value="7">Entro 7 giorni</SelectItem>
                  <SelectItem value="30">Entro 30 giorni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        </FiltriCollassabili>


        <div className="mb-3 text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Pagina <strong className="text-foreground">{page}</strong> di <strong className="text-foreground">{totalPages}</strong>
            <span className="ml-1">— <strong className="text-foreground">{totale}</strong> lead</span>
          </span>
          {canManage && totale > 0 && selezionati.size < totale && (
            <button
              type="button"
              className="text-primary hover:underline disabled:opacity-60"
              disabled={caricandoTutti}
              onClick={() => void selezionaTuttiFiltrati()}
            >
              {caricandoTutti ? "Selezione in corso…" : `Seleziona tutti i ${totale} filtrati`}
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs">Per pagina:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-[72px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessun lead trovato</p>
          </div>
        ) : (
          <>
          {/* Mobile: schede al posto della tabella */}
          <ElencoSchede>
            {rows.map((l) => (
              <SchedaLista
                key={l.id}
                onClick={() => navigate({ to: "/lead/$leadId", params: { leadId: l.id } })}
                titolo={nomeLead(l)}
                selezione={canManage ? { checked: selezionati.has(l.id), onChange: (v) => toggleSel(l.id, v) } : undefined}
                badge={
                  <Badge className={`${LEAD_STATO_CLASS[l.stato]} shrink-0`}>{LEAD_STATO_LABEL[l.stato]}</Badge>
                }
                campi={[
                  { etichetta: "Città", valore: `${l.citta ?? "—"}${l.provincia ? ` (${l.provincia})` : ""}` },
                  { etichetta: "Fonte", valore: LEAD_FONTE_LABEL[l.fonte] },
                  { etichetta: "Assegnato a", valore: nomeProfilo(l.assegnato_a) },
                  ...(mostraConversione
                    ? [
                        { etichetta: "Convertito il", valore: formatData(l.convertito_il) },
                        {
                          etichetta: "Cliente",
                          valore: l.cliente_id ? (
                            <span className="min-w-0 break-words">
                              {l.cliente?.ragione_sociale ?? "Scheda cliente"}
                              {l.conversione_tipo === "contatto_cliente" && (
                                <span className="block text-xs text-muted-foreground">come contatto</span>
                              )}
                            </span>
                          ) : (
                            "Cliente non collegato"
                          ),
                        },
                      ]
                    : [{ etichetta: "Prossima azione", valore: formatData(l.prossima_azione_il) }]),
                ]}
                footer={
                  <>
                    <Badge className={LEAD_PRIORITA_CLASS[l.priorita]}>{LEAD_PRIORITA_LABEL[l.priorita]}</Badge>
                    <Badge variant="outline" className="text-xs">{LEAD_TIPO_LABEL[l.tipo_lead]}</Badge>
                  </>
                }
              />
            ))}
          </ElencoSchede>


          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Seleziona tutta la pagina"
                        checked={tuttaPaginaSel ? true : qualcunoPaginaSel ? "indeterminate" : false}
                        onCheckedChange={(v) => selezionaPagina(v === true)}
                      />
                    </TableHead>
                  )}
                  <TableHead><SortHeader col="ragione_sociale" label="Nominativo" /></TableHead>
                  <TableHead>Tipo soggetto</TableHead>
                  <TableHead><SortHeader col="stato" label="Stato" /></TableHead>
                  <TableHead>Tipo lead</TableHead>
                  <TableHead><SortHeader col="priorita" label="Priorità" /></TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Sede / Agente</TableHead>
                  <TableHead>Assegnato a</TableHead>
                  {mostraConversione ? (
                    <>
                      <TableHead><SortHeader col="convertito_il" label="Data conversione" /></TableHead>
                      <TableHead>Cliente</TableHead>
                    </>
                  ) : (
                    <TableHead><SortHeader col="prossima_azione_il" label="Prossima azione" /></TableHead>
                  )}
                  <TableHead><SortHeader col="created_at" label="Creato" /></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((l) => (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/lead/$leadId", params: { leadId: l.id } })}
                  >
                    {canManage && (
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Seleziona ${nomeLead(l)}`}
                          checked={selezionati.has(l.id)}
                          onCheckedChange={(v) => toggleSel(l.id, v === true)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{nomeLead(l)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.tipo_soggetto === "persona_fisica" ? "Persona fisica" : l.tipo_soggetto === "azienda" ? "Azienda" : "—"}
                    </TableCell>
                    <TableCell><Badge className={LEAD_STATO_CLASS[l.stato]}>{LEAD_STATO_LABEL[l.stato]}</Badge></TableCell>
                    <TableCell className="text-xs">{LEAD_TIPO_LABEL[l.tipo_lead]}</TableCell>
                    <TableCell><Badge className={LEAD_PRIORITA_CLASS[l.priorita]}>{LEAD_PRIORITA_LABEL[l.priorita]}</Badge></TableCell>
                    <TableCell className="text-xs">{LEAD_FONTE_LABEL[l.fonte]}</TableCell>
                    <TableCell className="text-xs">
                      {l.citta ?? "—"}{l.provincia ? ` (${l.provincia})` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {nomeStore(l.store_id)}{l.agente_codice ? ` · ${l.agente_codice}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{nomeProfilo(l.assegnato_a)}</TableCell>
                    {mostraConversione ? (
                      <>
                        <TableCell className="text-xs">{formatData(l.convertito_il)}</TableCell>
                        <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                          {l.cliente_id ? (
                            <Link
                              to="/clienti/$clienteId"
                              params={{ clienteId: l.cliente_id }}
                              className="text-primary hover:underline"
                            >
                              {l.cliente?.ragione_sociale ?? "Scheda cliente"}
                            </Link>
                          ) : null}
                          {l.cliente_id && l.conversione_tipo === "contatto_cliente" && (
                            <div className="text-xs text-muted-foreground">come contatto</div>
                          )}
                          {l.cliente_id ? null : (
                            <span className="text-muted-foreground">Cliente non collegato</span>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="text-xs">{formatData(l.prossima_azione_il)}</TableCell>
                    )}
                    <TableCell className="text-xs">{formatData(l.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" /> Precedente
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Successiva <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
