import { createFileRoute, useNavigate, Outlet, useMatchRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Plus, Search, FileText, Pencil, Trash2, Send, Check, X, AlertCircle,
  Clock, CheckCircle2, Wallet, RotateCcw, MessageSquareWarning, Ban, MessageSquare,
  ChevronsUpDown, Paperclip, Banknote, TrendingUp,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  uploadAllegatoFile,
  validateAllegatoFile,
  fmtAllegatoBytes,
} from "@/components/allegati-section";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfig } from "@/hooks/use-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  STATO_LABEL, STATO_TONE, TIPO_TONE, calcolaLivello,
  formatEuro, formatDate, type TipoRichiesta, isRichiestaAttiva,
  determinaTipoRichiesta, importoRichiestaValido, etichettaTipoRichiesta,
  livelloApprovatore, puoDecidereRichiesta,
} from "@/lib/fidi";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { RICHIESTA_FIDO_SELECT } from "@/lib/richieste-fido-data";
import { CambioCondizionePagamento } from "@/components/cambio-condizione-pagamento";
import { PannelloRischioCliente } from "@/components/pannello-rischio-cliente";
import { semaforoUI, semaforoDaCliente } from "@/lib/semaforo-ui";
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { RichiestaFormDialog } from "@/components/richiesta-fido-form-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TAB_RICHIESTE = ["bozze", "in_approvazione", "approvate", "rifiutate", "tutto"] as const;

export const Route = createFileRoute("/_app/richieste")({
  validateSearch: (s: Record<string, unknown>): { tab?: (typeof TAB_RICHIESTE)[number] } => {
    const t = s.tab;
    return typeof t === "string" && (TAB_RICHIESTE as readonly string[]).includes(t)
      ? { tab: t as (typeof TAB_RICHIESTE)[number] }
      : {};
  },
  component: RichiestePage,
});

const STATI_IN_APPROVAZIONE = ["in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste"];

function giorniDa(d: string | null | undefined): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function attesaTone(g: number): string {
  if (g < 7) return "bg-success/15 text-success";
  if (g <= 14) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

/** Pallino rischio (semaforo affidabilita') con tooltip label + motivo. */
function SemaforoPallino({ cliente, className = "" }: { cliente: any; className?: string }) {
  const sem = semaforoCli(cliente);
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${sem.dotClass} ${className}`}
      title={`Rischio: ${sem.label} — ${sem.motivo}`}
      aria-label={`Rischio: ${sem.label}`}
    />
  );
}

/** Semaforo dal valore materializzato in fido_teorico_cliente (fonte unica). */
function semaforoCli(c: any) {
  const { stadio, motivo } = semaforoDaCliente(c);
  return semaforoUI(stadio, motivo);
}

/** Stato unico dei filtri della pagina Richieste fido. */
type OrdinaRichieste = "importo" | "data_invio" | "giorni";
type FiltriRichieste = {
  cerca: string; agente: string;
  store: string; tipo: string; rischio: string; livello: string;
  importoMin: string; importoMax: string; giorniMin: string;
  /** Ordinamento della lista "In approvazione" (non e' un filtro). */
  ordina: OrdinaRichieste;
  /** Interruttore approvatori limitati: nasconde le richieste in attesa di livelli superiori (non e' un filtro). */
  soloDecidibili: boolean;
};
const FILTRI_VUOTI: FiltriRichieste = { cerca: "", agente: "tutti", store: "tutti", tipo: "tutti", rischio: "tutti", livello: "tutti", importoMin: "", importoMax: "", giorniMin: "", ordina: "importo", soloDecidibili: false };
const STADI_RISCHIO = ["verde", "giallo", "arancione", "rosso", "spento"] as const;

function filtriAttivi(f: FiltriRichieste): boolean {
  return !!f.cerca.trim() || f.agente !== "tutti" || f.store !== "tutti" || f.tipo !== "tutti" || f.rischio !== "tutti" || f.livello !== "tutti" || !!f.importoMin || !!f.importoMax || !!f.giorniMin;
}

/**
 * Fonte unica del filtro: usata da lista, KPI e contatori delle schede.
 * "Giorni attesa" vale solo per le richieste in attesa di decisione.
 */
/** Minuscolo, senza accenti, spazi multipli ridotti. */
function normalizzaRicerca(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function filtraRichieste(righe: any[], f: FiltriRichieste, roles: readonly string[]): any[] {
  const q = normalizzaRicerca(f.cerca);
  return righe.filter((r) => {
    const c = r.clienti;
    if (q && ![c?.ragione_sociale, c?.partita_iva, c?.codice_fiscale, c?.codice_gestionale].some((v) => normalizzaRicerca(v).includes(q))) return false;
    if (f.agente === "__none__" ? !!c?.codice_agente : f.agente !== "tutti" && c?.codice_agente !== f.agente) return false;
    if (f.store !== "tutti" && r.clienti?.store_id !== f.store) return false;
    // "Nuovo fido": l'enum ha anche il valore storico "nuovo" (stessa etichetta).
    if (f.tipo !== "tutti" && !(r.tipo === f.tipo || (f.tipo === "nuovo_fido" && r.tipo === "nuovo"))) return false;
    if (f.rischio !== "tutti" && semaforoDaCliente(r.clienti).stadio !== f.rischio) return false;
    if (f.livello !== "tutti" && Number(r.livello_richiesto) !== Number(f.livello)) return false;
    if (f.importoMin && Number(r.importo_richiesto) < Number(f.importoMin)) return false;
    if (f.importoMax && Number(r.importo_richiesto) > Number(f.importoMax)) return false;
    if (f.giorniMin && STATI_IN_APPROVAZIONE.includes(r.stato) && giorniDa(r.data_invio) < Number(f.giorniMin)) return false;
    // Interruttore "Solo quelle che posso decidere": nasconde solo le richieste
    // in attesa di decisione su cui l'utente non puo' pronunciarsi (fonte unica
    // puoDecidereRichiesta); bozze/approvate/rifiutate restano visibili.
    if (f.soloDecidibili && STATI_IN_APPROVAZIONE.includes(r.stato) && !puoDecidereRichiesta(roles, r.livello_richiesto)) return false;
    return true;
  });
}

function ordinaRichieste(righe: any[], ordina: OrdinaRichieste): any[] {
  const tsInvio = (r: any) => new Date(r.data_invio ?? r.created_at ?? 0).getTime();
  const copia = [...righe];
  if (ordina === "data_invio") return copia.sort((a, b) => tsInvio(a) - tsInvio(b));
  if (ordina === "giorni") return copia.sort((a, b) => giorniDa(b.data_invio) - giorniDa(a.data_invio));
  return copia.sort((a, b) => Number(b.importo_richiesto) - Number(a.importo_richiesto));
}

function FiltriRichiesteBar({ filtri, onChange, stores, approvatoreLimitato, soloDecidibiliIniziale, decidibiliInAttesa }: {
  filtri: FiltriRichieste; onChange: (f: FiltriRichieste) => void; stores: [string, string][];
  approvatoreLimitato: boolean; soloDecidibiliIniziale: boolean; decidibiliInAttesa: number;
}) {
  const set = (k: keyof FiltriRichieste, v: string) => onChange({ ...filtri, [k]: v });
  // Stessa query (e cache) del filtro Agente dello scadenziario.
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });
  // Ricerca con debounce 300 ms: l'input e' locale, il filtro si aggiorna dopo.
  const [cercaInput, setCercaInput] = useState(filtri.cerca);
  useEffect(() => { setCercaInput(filtri.cerca); }, [filtri.cerca]);
  const filtriRef = useRef(filtri);
  filtriRef.current = filtri;
  useEffect(() => {
    if (cercaInput === filtriRef.current.cerca) return;
    const t = setTimeout(() => onChange({ ...filtriRef.current, cerca: cercaInput }), 300);
    return () => clearTimeout(t);
  }, [cercaInput, onChange]);
  const attivi = filtriAttivi(filtri) || !!cercaInput.trim();
  return (
    <Card className="p-3 flex flex-wrap gap-2 items-center">
      <Input
        className="flex-1 min-w-[220px] sm:min-w-[260px]"
        placeholder="Cerca ragione sociale, P.IVA, C.F., codice…"
        value={cercaInput}
        onChange={(e) => setCercaInput(e.target.value)}
      />
      <Select value={filtri.agente} onValueChange={(v) => set("agente", v)}>
        <SelectTrigger className="flex-1 min-w-[160px] sm:flex-none sm:w-48"><SelectValue placeholder="Agente" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tutti">Tutti gli agenti</SelectItem>
          <SelectItem value="__none__">Senza agente</SelectItem>
          {(agenti ?? []).map((a) => <SelectItem key={a.codice} value={a.codice}>{a.descrizione}</SelectItem>)}
        </SelectContent>
      </Select>
      {stores.length > 1 && (
        <Select value={filtri.store} onValueChange={(v) => set("store", v)}>
          <SelectTrigger className="flex-1 min-w-[160px] sm:flex-none sm:w-44"><SelectValue placeholder="Store" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli store</SelectItem>
            {stores.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={filtri.tipo} onValueChange={(v) => set("tipo", v)}>
        <SelectTrigger className="flex-1 min-w-[160px] sm:flex-none sm:w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tutti">Tutti i tipi</SelectItem>
          <SelectItem value="nuovo_fido">Nuovo fido</SelectItem>
          <SelectItem value="aumento">Aumento</SelectItem>
          <SelectItem value="diminuzione">Diminuzione</SelectItem>
          <SelectItem value="rinnovo">Rinnovo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filtri.rischio} onValueChange={(v) => set("rischio", v)}>
        <SelectTrigger className="flex-1 min-w-[160px] sm:flex-none sm:w-40"><SelectValue placeholder="Rischio" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tutti">Tutti i rischi</SelectItem>
          {STADI_RISCHIO.map((st) => {
            const ui = semaforoUI(st);
            return (
              <SelectItem key={st} value={st}>
                <span className="inline-flex items-center gap-2">
                  <span className={`size-2.5 shrink-0 rounded-full ${ui.dotClass}`} />
                  {ui.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Select value={filtri.livello} onValueChange={(v) => set("livello", v)}>
        <SelectTrigger className="flex-1 min-w-[140px] sm:flex-none sm:w-32"><SelectValue placeholder="Livello" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tutti">Tutti i livelli</SelectItem>
          <SelectItem value="1">Liv. 1</SelectItem>
          <SelectItem value="2">Liv. 2</SelectItem>
          <SelectItem value="3">Liv. 3</SelectItem>
        </SelectContent>
      </Select>
      <Input className="flex-1 min-w-[140px] sm:flex-none sm:min-w-0 sm:w-28" type="number" placeholder="Importo min" value={filtri.importoMin} onChange={(e) => set("importoMin", e.target.value)} />
      <Input className="flex-1 min-w-[140px] sm:flex-none sm:min-w-0 sm:w-28" type="number" placeholder="Importo max" value={filtri.importoMax} onChange={(e) => set("importoMax", e.target.value)} />
      <Input className="flex-1 min-w-[140px] sm:flex-none sm:min-w-0 sm:w-32" type="number" placeholder="Giorni attesa ≥" title="Vale solo per le richieste in attesa di decisione" value={filtri.giorniMin} onChange={(e) => set("giorniMin", e.target.value)} />
      <Select value={filtri.ordina} onValueChange={(v) => onChange({ ...filtri, ordina: v as OrdinaRichieste })}>
        <SelectTrigger className="flex-1 min-w-[180px] sm:flex-none sm:w-52" title="Ordinamento della lista In approvazione"><SelectValue placeholder="Ordina" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="importo">Ordina: Importo (decrescente)</SelectItem>
          <SelectItem value="data_invio">Ordina: Data invio (più vecchie)</SelectItem>
          <SelectItem value="giorni">Ordina: Giorni in attesa</SelectItem>
        </SelectContent>
      </Select>
      {/* Interruttore solo per approvatori con livello limitato: non e' un filtro,
          quindi non compare in "Azzera filtri" e filtriAttivi non lo conta. */}
      {approvatoreLimitato && (
        <label className="flex items-center gap-2 flex-1 min-w-[200px] sm:flex-none h-10 cursor-pointer select-none">
          <Switch
            checked={filtri.soloDecidibili}
            onCheckedChange={(v) => onChange({ ...filtri, soloDecidibili: v })}
            aria-label="Solo quelle che posso decidere"
          />
          <span className="text-sm leading-tight min-w-0">
            Solo quelle che posso decidere{" "}
            <span className="text-muted-foreground whitespace-nowrap">({decidibiliInAttesa})</span>
          </span>
        </label>
      )}
      {attivi && (
        <Button variant="ghost" size="sm" className="h-10" onClick={() => {
          setCercaInput("");
          // "Azzera filtri" riporta l'interruttore al valore iniziale dell'utente.
          onChange({ ...FILTRI_VUOTI, ordina: filtri.ordina, soloDecidibili: soloDecidibiliIniziale });
        }}>Azzera filtri</Button>
      )}
    </Card>
  );
}

function userName(p: any): string {
  if (!p) return "—";
  const n = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  return n || p.email || "—";
}

function RichiestePage() {
  const { user, role, roles, profilo } = useAuth();
  // Multi-ruolo: un utente puo' avere piu' ruoli, usiamo sempre roles.includes(...)
  const isAdmin = roles.includes("amministratore");
  const livello = livelloApprovatore(roles);
  const isApprovatore = livello > 0;
  const isAmministrazione = roles.includes("amministrazione");
  const isDirezione = roles.includes("direzione");
  // Visibilità totale (vede tutte le richieste di tutti gli store/livelli/stati).
  // Il livello di approvatore limita solo COSA si puo' approvare, non COSA si vede.
  const hasFullVisibility = isAdmin || isAmministrazione || isDirezione;
  // "Vede solo le proprie" = chi non ha visibilita' totale e non e' approvatore (= store_manager)
  const isStoreManager = !hasFullVisibility && !isApprovatore;
  // Approvatore con livello limitato (Liv. 1 o 2, non admin): vede la scheda
  // "In approvazione" con anche richieste che non puo' decidere → interruttore.
  const approvatoreLimitato = !isAdmin && livello > 0 && livello < 3;
  // Puo' creare/inviare richieste: admin, store_manager, amministrazione, approvatori
  const canCreateRichiesta =
    isAdmin || isApprovatore || isAmministrazione || roles.includes("store_manager");

  const defaultTab = isApprovatore && !isAdmin ? "in_approvazione" : "bozze";
  const { tab: tabIniziale } = Route.useSearch();
  const [tab, setTab] = useState<string>(tabIniziale ?? defaultTab);
  const [openNew, setOpenNew] = useState(false);



  const { data: richieste, isLoading } = useQuery({
    queryKey: ["richieste", role, profilo?.store_id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("richieste_fido")
        .select(RICHIESTA_FIDO_SELECT)
        .order("created_at", { ascending: false });
      if (isStoreManager) {
        q = q.eq("created_by", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const matchRoute = useMatchRoute();
  const isDetailOpen = matchRoute({ to: "/richieste/$richiestaId", fuzzy: true });

  const { data: msgCounts } = useQuery({
    queryKey: ["msg-non-letti-richieste", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      // "Non letto da me" = letto_da NON contiene il mio user.id, e non sono autore
      const { data } = await (supabase as any)
        .from("comunicazioni_richiesta")
        .select("richiesta_id, letto_da, autore_id")
        .neq("autore_id", user?.id ?? "");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        const lettoDa: string[] = m.letto_da ?? [];
        if (!user?.id || lettoDa.includes(user.id)) return;
        counts[m.richiesta_id] = (counts[m.richiesta_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const tutteRichieste = richieste ?? [];
  const [filtri, setFiltri] = useState<FiltriRichieste>(() => ({ ...FILTRI_VUOTI, soloDecidibili: approvatoreLimitato }));
  const storesFiltro = useMemo(() => {
    const map = new Map<string, string>();
    tutteRichieste.forEach((r: any) => {
      if (r.clienti?.store_id && r.clienti?.stores?.nome) map.set(r.clienti.store_id, r.clienti.stores.nome);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [tutteRichieste]);
  // Righe filtrate: base unica per KPI, contatori schede e liste.
  const all = useMemo(() => filtraRichieste(tutteRichieste, filtri, roles), [tutteRichieste, filtri, roles]);
  // Richieste in attesa che l'utente puo' decidere, sulle righe non filtrate
  // (contatore tra parentesi dell'interruttore).
  const decidibiliInAttesa = useMemo(
    () => tutteRichieste.filter((r) => STATI_IN_APPROVAZIONE.includes(r.stato) && puoDecidereRichiesta(roles, r.livello_richiesto)).length,
    [tutteRichieste, roles],
  );

  // KPI calcoli
  const oraMese = new Date();
  const inizioMese = new Date(oraMese.getFullYear(), oraMese.getMonth(), 1).toISOString();
  const kpi = useMemo(() => {
    const mie = isStoreManager ? all : all;
    const bozze = mie.filter((r) => r.stato === "bozza" && (isStoreManager ? r.created_by === user?.id : true)).length;
    const inAttesa = all.filter((r) => STATI_IN_APPROVAZIONE.includes(r.stato));
    // KPI "in attesa": per approvatori puri (senza visibilita' totale) mostra
    // solo le richieste del proprio livello; admin/amministrazione/direzione
    // vedono il totale complessivo.
    const inAttesaCount = isApprovatore && !hasFullVisibility
      ? inAttesa.filter((r) => r.livello_corrente === livello).length
      : inAttesa.length;
    const approvateMese = all.filter((r) => r.stato === "approvata" && r.data_chiusura && r.data_chiusura >= inizioMese).length;
    const insiemeInAttesa = isApprovatore && !hasFullVisibility
      ? inAttesa.filter((r) => r.livello_corrente === livello)
      : inAttesa;
    const valoreInAttesa = insiemeInAttesa.reduce((s, r) => s + Number(r.importo_richiesto ?? 0), 0);
    // Stesso insieme: somma del fido attuale dei clienti, contato una volta
    // per richiesta (un cliente con piu' richieste pesa per ogni richiesta).
    const fidoAttualeInAttesa = insiemeInAttesa.reduce((s, r) => s + getFidoAttuale(r.clienti), 0);
    const differenzaInAttesa = valoreInAttesa - fidoAttualeInAttesa;
    return { bozze, inAttesaCount, approvateMese, valoreInAttesa, fidoAttualeInAttesa, differenzaInAttesa };
  }, [all, user?.id, isStoreManager, isApprovatore, hasFullVisibility, livello, inizioMese]);

  const bozze = all.filter((r) => r.stato === "bozza");
  const inCodaUtente = (r: any) => {
    if (!STATI_IN_APPROVAZIONE.includes(r.stato)) return false;
    // Visibilita': admin/amministrazione/direzione vedono tutto.
    // Un approvatore puro vede tutte le richieste del proprio livello corrente
    // (il filtro per livello qui e' una scelta UI per la propria coda di lavoro,
    // non un limite di sicurezza: l'utente puo' comunque aprire il dettaglio
    // tramite link diretto se serve consultare gli altri livelli).
    if (isApprovatore && !hasFullVisibility) return r.livello_corrente === livello;
    return true;
  };
  const inApprovazione = all.filter(inCodaUtente);

  const approvate = all.filter((r) => r.stato === "approvata");
  const rifiutate = all.filter((r) => r.stato === "rifiutata" || r.stato === "annullata");


  const qc = useQueryClient();
  // Invalidazione + refetch IMMEDIATO di tutte le query osservate che
  // dipendono dalle richieste fido (lista + KPI in alto + contatori messaggi
  // + viste correlate). `refetchQueries({type:"active"})` forza il refetch
  // subito invece di limitarsi a marcare stale, cosi' la riga sparisce
  // (o cambia tab) appena la mutation finisce, senza bisogno di ricaricare.
  async function qcInvalidate() {
    await Promise.all([
      qc.refetchQueries({ queryKey: ["richieste"], type: "active" }),
      qc.refetchQueries({ queryKey: ["approvazioni-queue"], type: "active" }),
      qc.refetchQueries({ queryKey: ["richieste-cliente"], type: "active" }),
      qc.refetchQueries({ queryKey: ["msg-non-letti-richieste"], type: "active" }),
      qc.refetchQueries({ queryKey: ["comunicazioni-non-lette"], type: "active" }),
    ]);
    // Marca stale anche le inattive cosi' al prossimo mount sono fresche.
    qc.invalidateQueries({ queryKey: ["richieste"] });
    qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
    qc.invalidateQueries({ queryKey: ["richieste-cliente"] });
  }


  if (isDetailOpen) return <Outlet />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Richieste fido</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isStoreManager ? "Le tue richieste" : isApprovatore && !isAdmin ? `Coda approvazioni Liv. ${livello}` : "Tutte le richieste del sistema"}
          </p>
        </div>
        {canCreateRichiesta && (
          <Button className="gap-1.5" onClick={() => setOpenNew(true)}>
            <Plus className="size-4" /> Nuova richiesta
          </Button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <KpiCard icon={FileText} tone="text-muted-foreground" label="Bozze da inviare" value={String(kpi.bozze)} />
        <KpiCard icon={Clock} tone="text-info" label="In attesa approvazione" value={String(kpi.inAttesaCount)} />
        <KpiCard icon={CheckCircle2} tone="text-success" label="Approvate questo mese" value={String(kpi.approvateMese)} />
        <KpiCard
          icon={Wallet}
          tone="text-muted-foreground"
          label="Fido attuale (in approvazione)"
          value={formatEuro(kpi.fidoAttualeInAttesa)}
          title="Fido attuale e differenza sono calcolati per richiesta: un cliente con più richieste in approvazione è contato una volta per ogni richiesta."
        />
        <KpiCard
          icon={Banknote}
          tone="text-primary"
          label="Valore in approvazione"
          value={formatEuro(kpi.valoreInAttesa)}
        />
        <KpiCard
          icon={TrendingUp}
          tone={kpi.differenzaInAttesa >= 0 ? "text-info" : "text-destructive"}
          label="Differenza"
          value={`${kpi.differenzaInAttesa >= 0 ? "+" : "−"}${formatEuro(Math.abs(kpi.differenzaInAttesa))}`}
          valueClassName={kpi.differenzaInAttesa >= 0 ? "text-info" : "text-destructive"}
          title="Fido attuale e differenza sono calcolati per richiesta: un cliente con più richieste in approvazione è contato una volta per ogni richiesta."
        />
      </div>

      <FiltriRichiesteBar filtri={filtri} onChange={setFiltri} stores={storesFiltro} approvatoreLimitato={approvatoreLimitato} soloDecidibiliIniziale={approvatoreLimitato} decidibiliInAttesa={decidibiliInAttesa} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {!isApprovatore || isAdmin ? (
            <TabsTrigger value="bozze">Bozze {bozze.length > 0 && <Badge variant="secondary" className="ml-2">{bozze.length}</Badge>}</TabsTrigger>
          ) : null}
          <TabsTrigger value="in_approvazione">
            In Approvazione {inApprovazione.length > 0 && <Badge variant="secondary" className="ml-2">{inApprovazione.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approvate">
            Approvate {approvate.length > 0 && <Badge variant="secondary" className="ml-2">{approvate.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="rifiutate">
            Rifiutate {rifiutate.length > 0 && <Badge variant="secondary" className="ml-2">{rifiutate.length}</Badge>}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="tutto">
              Tutto {all.length > 0 && <Badge variant="secondary" className="ml-2">{all.length}</Badge>}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="bozze" className="mt-4">
          <BozzeTab
            rows={bozze}
            loading={isLoading}
            onChanged={qcInvalidate}
            msgCounts={msgCounts}
          />
        </TabsContent>

        <TabsContent value="in_approvazione" className="mt-4">
          {approvatoreLimitato && !filtri.soloDecidibili && (
            <p className="text-xs text-muted-foreground mb-2">
              Le richieste con la casella grigia sono di un livello superiore al tuo (Liv. {livello}): puoi consultarle ma non deciderle.
            </p>
          )}
          <InApprovazioneTab
            rows={inApprovazione}
            righeCodaNonFiltrate={tutteRichieste.filter(inCodaUtente)}
            loading={isLoading}
            canApprove={isAdmin || isApprovatore}
            ordina={filtri.ordina}
            onChanged={qcInvalidate}
          />
        </TabsContent>

        <TabsContent value="approvate" className="mt-4 space-y-3">
          {(isAdmin || isApprovatore) && (
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href="/fidi-processare"><FileText className="size-4" /> Vai a Fidi da processare</a>
              </Button>
            </div>
          )}
          <StoricoTab
            rows={approvate}
            loading={isLoading}
            kind="approvata"
            msgCounts={msgCounts}
          />
        </TabsContent>

        <TabsContent value="rifiutate" className="mt-4">
          <StoricoTab
            rows={rifiutate}
            loading={isLoading}
            kind="rifiutata"
            msgCounts={msgCounts}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="tutto" className="mt-4">
            <TuttoTab rows={all} loading={isLoading} msgCounts={msgCounts} />
          </TabsContent>
        )}

      </Tabs>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        {openNew && <RichiestaFormDialog onClose={() => setOpenNew(false)} onSaved={qcInvalidate} />}
      </Dialog>

 
    </div>
  );
}

function KpiCard({ icon: Icon, tone, label, value, valueClassName, title }: { icon: any; tone: string; label: string; value: string; valueClassName?: string; title?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-1.5 min-w-0">
        <Icon className={`size-4 shrink-0 mt-0.5 ${tone}`} />
        <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className={`text-lg sm:text-xl font-bold tabular-nums break-words mt-1 ${valueClassName ?? ""}`} title={title}>{value}</p>
    </Card>
  );
}

/* ============================ BOZZE TAB ============================ */
function BozzeTab({
  rows, loading, onChanged, msgCounts,
}: { rows: any[]; loading: boolean; onChanged: () => void; msgCounts?: Record<string, number> }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invioMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "in_approvazione", data_invio: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} richieste inviate in approvazione`);
      setSelected(new Set());
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  const allSel = rows.length > 0 && selected.size === rows.length;

  if (loading) return <SkeletonTable />;
  if (rows.length === 0) return <Empty label="Nessuna bozza" hint="Crea una nuova richiesta" />;

  return (
    <Card className="p-2 sm:p-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 mb-2 bg-primary/5 rounded-md">
          <p className="text-sm font-medium">{selected.size} selezionate</p>
          <Button size="sm" onClick={() => invioMut.mutate(Array.from(selected))} disabled={invioMut.isPending}>
            <Send className="size-4" /> Invia tutte
          </Button>
        </div>
      )}
      <ElencoSchede>
        {rows.map((r) => (
          <SchedaLista
            key={r.id}
            onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
            colonneCampi={2}
            selezione={{ checked: selected.has(r.id), onChange: () => toggle(r.id) }}
            titolo={<span className="inline-flex items-start gap-2 min-w-0"><SemaforoPallino cliente={r.clienti} className="mt-1.5" /><span className="min-w-0 break-words">{r.clienti?.ragione_sociale ?? "—"}</span></span>}
            badge={<span className="inline-flex flex-wrap items-center justify-end gap-1"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span>}
            campi={[
              { etichetta: "Importo rich.", valore: <span className="tabular-nums">{formatEuro(Number(r.importo_richiesto))}</span> },
              { etichetta: "Fido attuale", valore: <span className="tabular-nums">{formatEuro(getFidoAttuale(r.clienti))}</span> },
              { etichetta: "Richiesto da", valore: userName((r as any).richiedente) },
              { etichetta: "Data", valore: formatDate(r.created_at) },
            ]}
            footer={(msgCounts?.[r.id] ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>
            ) : undefined}
          />
        ))}
      </ElencoSchede>
      <div className="hidden md:block">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"><Checkbox checked={allSel} onCheckedChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} /></TableHead>
            <TableHead>Cliente</TableHead>
                <TableHead className="w-16 text-center">Rischio</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Importo richiesto</TableHead>
            <TableHead className="text-right">Fido attuale</TableHead>
            <TableHead>Richiesto da</TableHead>
            <TableHead>Data creazione</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest('[role="checkbox"]')) return;
                navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } });
              }}
            >
              <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>
              <TableCell className="font-medium">
                <div className="inline-flex items-center gap-2">
                  {r.clienti?.ragione_sociale ?? "—"}
                  {(msgCounts?.[r.id] ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                      <MessageSquare className="size-3" />
                      {msgCounts![r.id]}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center"><SemaforoPallino cliente={r.clienti} /></TableCell>
              <TableCell>
                <span className="inline-flex flex-wrap items-center gap-1">
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
                  {etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}
                </span>
                <CambioCondizionePagamento variant="badge" richiesta={r} />
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatEuro(getFidoAttuale(r.clienti))}
              </TableCell>
              <TableCell className="text-sm">{userName((r as any).richiedente)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </Card>
  );
}

/* ====================== IN APPROVAZIONE TAB ====================== */
function InApprovazioneTab({
  rows, righeCodaNonFiltrate, loading, canApprove, ordina, onChanged,
}: {
  rows: any[]; righeCodaNonFiltrate: any[]; loading: boolean; canApprove: boolean; ordina: OrdinaRichieste; onChanged: () => void;
}) {

  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ kind: "approva" | "rifiuta"; rows: any[] } | null>(null);
  const [note, setNote] = useState("");
  // Decidibile = stato "in_approvazione" (l'unico accettato da processa_richiesta_fido)
  // e livello consentito (fonte unica puoDecidereRichiesta).
  const decidibile = (r: any) => r.stato === "in_approvazione" && puoDecidereRichiesta(roles, r.livello_richiesto);
  const motivoNonDecidibile = (r: any) =>
    r.stato !== "in_approvazione" ? `Stato "${STATO_LABEL[r.stato as keyof typeof STATO_LABEL] ?? r.stato}": non decidibile` : `Richiede liv. ${r.livello_richiesto}`;

  const { data: msgNonLetti } = useQuery({
    queryKey: ["comunicazioni-non-lette", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("comunicazioni_richiesta")
        .select("richiesta_id, letto_da, autore_id")
        .neq("autore_id", user?.id ?? "");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        const lettoDa: string[] = m.letto_da ?? [];
        if (!user?.id || lettoDa.includes(user.id)) return;
        counts[m.richiesta_id] = (counts[m.richiesta_id] ?? 0) + 1;
      });
      return counts;
    },
    refetchInterval: 30000,
  });

  // rows arriva gia' filtrato dalla pagina (filtraRichieste): qui solo ordinamento.
  const filtered = ordinaRichieste(rows, ordina);
  const decidibili = filtered.filter(decidibile);

  const clienteIdsInCoda = useMemo(() => Array.from(new Set(righeCodaNonFiltrate.map((r) => r.cliente_id))), [righeCodaNonFiltrate]);
  const { data: altreApprovateNonEsportate } = useQuery({
    queryKey: ["altre-approvate-non-esportate", clienteIdsInCoda.slice().sort().join(",")],
    enabled: clienteIdsInCoda.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select("id, cliente_id, stato, stato_export")
        .in("cliente_id", clienteIdsInCoda)
        .eq("stato", "approvata")
        .neq("stato_export", "processata");
      if (error) throw error;
      return data ?? [];
    },
  });
  const altreAttiveMap = useMemo(() => {
    const map = new Map<string, number>();
    const countByCliente = new Map<string, number>();
    righeCodaNonFiltrate.forEach((r) => countByCliente.set(r.cliente_id, (countByCliente.get(r.cliente_id) ?? 0) + 1));
    countByCliente.forEach((n, cid) => { if (n > 1) map.set(cid, (map.get(cid) ?? 0) + n - 1); });
    (altreApprovateNonEsportate ?? []).forEach((r) => map.set(r.cliente_id, (map.get(r.cliente_id) ?? 0) + 1));
    return map;
  }, [righeCodaNonFiltrate, altreApprovateNonEsportate]);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  const allSel = decidibili.length > 0 && decidibili.every((r) => selected.has(r.id));

  // Stessa logica di approvazioni.tsx: una chiamata alla RPC (SECURITY DEFINER,
  // valida livello e stato) per ogni richiesta; importo approvato = richiesto.
  async function processaRichiesta(r: any, esito: "approvata" | "rifiutata", noteDecisione: string | null) {
    if (!user) throw new Error("Utente non autenticato");
    if (!decidibile(r)) {
      throw new Error(`${r.clienti?.ragione_sociale ?? "Richiesta"}: ${motivoNonDecidibile(r)}`);
    }
    const { error } = await (supabase as any).rpc("processa_richiesta_fido", {
      _richiesta_id: r.id,
      _esito: esito,
      _note: noteDecisione || null,
      _importo_approvato: esito === "approvata" ? Number(r.importo_richiesto) : null,
    });
    if (error) throw error;
  }

  const decisionMut = useMutation({
    mutationFn: async (input: { kind: "approva" | "rifiuta"; rows: any[]; note: string }) => {
      const esito = input.kind === "approva" ? "approvata" : "rifiutata";
      for (const r of input.rows) await processaRichiesta(r, esito, input.note.trim() || null);
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.rows.length} richieste ${v.kind === "approva" ? "approvate" : "rifiutate"}`);
      setAction(null); setNote(""); setSelected(new Set());
      onChanged();
    },
    onError: (e: Error) => { toast.error(e.message); onChanged(); },
  });

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">

      {filtered.length === 0 ? (
        <Empty label="Nessuna richiesta in approvazione" hint="" />
      ) : (
        <Card className="p-2 sm:p-3">
          {canApprove && selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 mb-2 bg-primary/5 rounded-md sticky top-16 lg:top-2 z-10">
              <p className="text-sm font-medium min-w-0">
                {selected.size} selezionate · {formatEuro(filtered.filter((r) => selected.has(r.id)).reduce((s, r) => s + Number(r.importo_richiesto), 0))}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30"
                  onClick={() => setAction({ kind: "rifiuta", rows: filtered.filter((r) => selected.has(r.id)) })}>
                  <X className="size-4" /> Rifiuta
                </Button>
                <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => setAction({ kind: "approva", rows: filtered.filter((r) => selected.has(r.id)) })}>
                  <Check className="size-4" /> Approva selezionate
                </Button>
              </div>
            </div>
          )}
          <ElencoSchede>
            {filtered.map((r) => {
              const g = giorniDa(r.data_invio);
              const livMio = canApprove && decidibile(r);
              const unread = msgNonLetti?.[r.id] ?? 0;
              const nAltre = altreAttiveMap.get(r.cliente_id) ?? 0;
              return (
                <SchedaLista
                  key={r.id}
                  onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
                  colonneCampi={2}
                  selezione={livMio ? { checked: selected.has(r.id), onChange: () => toggle(r.id) } : undefined}
                  titolo={<span className="inline-flex items-start gap-2 min-w-0"><SemaforoPallino cliente={r.clienti} className="mt-1.5" /><span className="min-w-0 break-words">{r.clienti?.ragione_sociale ?? "—"}</span></span>}
                  badge={<span className="inline-flex flex-wrap items-center justify-end gap-1"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span>}
                  campi={[
                    { etichetta: "Importo", valore: <span className="tabular-nums font-medium">{formatEuro(Number(r.importo_richiesto))}</span> },
                    { etichetta: "Fido attuale", valore: <span className="tabular-nums">{formatEuro(getFidoAttuale(r.clienti))}</span> },
                    { etichetta: "Tot. rischio", valore: <span className="tabular-nums">{formatEuro(Number(r.clienti?.totale_rischio ?? 0))}</span> },
                    { etichetta: "Scaduto", valore: Number(r.clienti?.scaduto ?? 0) > 0 ? <span className="tabular-nums text-destructive">{formatEuro(Number(r.clienti?.scaduto))}</span> : "—" },
                    { etichetta: "Store", valore: r.clienti?.stores?.nome ?? "—" },
                    { etichetta: "Richiesto da", valore: userName((r as any).richiedente) },
                  ]}
                  footer={
                    <>
                      <Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${attesaTone(g)}`}>{g}gg</span>
                      {unread > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{unread}</span>}
                      {nAltre > 0 && <Badge variant="outline" className="text-warning border-warning/40 gap-1" title="Altra richiesta attiva o approvata-non-esportata per lo stesso cliente"><AlertCircle className="size-3" /> +{nAltre}</Badge>}
                    </>
                  }
                />
              );
            })}
          </ElencoSchede>
          <div className="hidden md:block">
          <Table className="min-w-[1300px]">
            <TableHeader>
              <TableRow>
                {canApprove && <TableHead className="w-8"><Checkbox checked={allSel} disabled={decidibili.length === 0} title="Seleziona tutte le richieste su cui puoi decidere" onCheckedChange={() => setSelected(allSel ? new Set() : new Set(decidibili.map((r) => r.id)))} /></TableHead>}
                <TableHead>Cliente</TableHead>
                <TableHead className="w-16 text-center">Rischio</TableHead>
                {!isStoreManagerView(canApprove) && <TableHead>Store</TableHead>}
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">Fido attuale</TableHead>
                <TableHead className="text-right">Tot. rischio</TableHead>
                <TableHead className="text-right">Scaduto</TableHead>
                <TableHead>Liv.</TableHead>
                <TableHead>Richiesto da</TableHead>
                <TableHead>Data invio</TableHead>
                <TableHead>Giorni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const g = giorniDa(r.data_invio);
                const livMio = canApprove && decidibile(r);
                const unread = msgNonLetti?.[r.id] ?? 0;
                const nAltre = altreAttiveMap.get(r.cliente_id) ?? 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
                  >
                    {canApprove && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {livMio ? (
                          <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex"><Checkbox checked={false} disabled /></span>
                            </TooltipTrigger>
                            <TooltipContent>{motivoNonDecidibile(r)}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <div className="inline-flex items-center gap-2">
                        {r.clienti?.ragione_sociale ?? "—"}
                        {unread > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                            <MessageSquare className="size-3" />
                            {unread}
                          </span>
                        )}
                        {nAltre > 0 && <Badge variant="outline" className="text-warning border-warning/40 gap-1 text-xs" title="Altra richiesta attiva o approvata-non-esportata per lo stesso cliente"><AlertCircle className="size-3" /> +{nAltre}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center"><SemaforoPallino cliente={r.clienti} /></TableCell>
                    {!isStoreManagerView(canApprove) && <TableCell className="text-sm text-muted-foreground">{r.clienti?.stores?.nome ?? "—"}</TableCell>}
                    <TableCell><span className="inline-flex flex-wrap items-center gap-1"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEuro(getFidoAttuale(r.clienti))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEuro(Number(r.clienti?.totale_rischio ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.clienti?.scaduto ?? 0) > 0 ? <span className="text-destructive">{formatEuro(Number(r.clienti?.scaduto))}</span> : "—"}</TableCell>
                    <TableCell><Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge></TableCell>
                    <TableCell className="text-sm">{userName((r as any).richiedente)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_invio ?? (r.stato !== "bozza" ? r.created_at : null))}</TableCell>
                    <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${attesaTone(g)}`}>{g}gg</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}

      {/* Dialog conferma (stessa struttura di approvazioni.tsx) */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "approva" ? "Conferma approvazione" : "Conferma rifiuto"}</DialogTitle>
            <DialogDescription>
              Stai per {action?.kind === "approva" ? "approvare" : "rifiutare"} <strong>{action?.rows.length ?? 0}</strong> richieste
              {" "}per un totale di <strong>{formatEuro((action?.rows ?? []).reduce((s, r) => s + Number(r.importo_richiesto), 0))}</strong>.
              {action?.kind === "approva" && " L'importo approvato è quello richiesto."} L'operazione è irreversibile.
            </DialogDescription>
            {(() => {
              const nCambio = (action?.rows ?? []).filter((r) => mapRichiestaFido(r).cambioCondPag).length;
              return nCambio > 0 ? (
                <p className="text-sm rounded-md border border-warning/40 bg-warning/10 p-2 break-words">
                  {nCambio} {nCambio === 1 ? "richiesta include" : "richieste includono"} un cambio di condizione di pagamento: verrà {action?.kind === "approva" ? "approvato" : "rifiutato"} insieme al fido. Per decidere separatamente apri la singola richiesta.
                </p>
              ) : null;
            })()}
          </DialogHeader>
          <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {(action?.rows ?? []).map((r) => (
              <div key={r.id} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">{r.clienti?.ragione_sociale ?? "—"}</span>
                <span className="tabular-nums shrink-0">{formatEuro(Number(r.importo_richiesto))}</span>
              </div>
            ))}
          </div>
          {action?.kind === "approva" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Note (opzionali, applicate a tutte)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo del rifiuto <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Specifica il motivo (obbligatorio)" />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAction(null)} disabled={decisionMut.isPending}>Annulla</Button>
            <Button
              disabled={decisionMut.isPending || (action?.kind === "rifiuta" && !note.trim())}
              className={action?.kind === "approva" ? "bg-success text-success-foreground hover:bg-success/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
              onClick={() => { if (action) decisionMut.mutate({ kind: action.kind, rows: action.rows, note }); }}
            >
              {decisionMut.isPending ? "Elaborazione..." : action?.kind === "approva" ? "Conferma approvazione" : "Conferma rifiuto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function isStoreManagerView(canApprove: boolean): boolean { return !canApprove; }

/* ============================ STORICO TAB ============================ */
function StoricoTab({
  rows, loading, kind, msgCounts,
}: { rows: any[]; loading: boolean; kind: "approvata" | "rifiutata"; msgCounts?: Record<string, number> }) {

  const navigate = useNavigate();
  const [meseFiltro, setMeseFiltro] = useState<string>("ultimi3");
  const [mostraTutto, setMostraTutto] = useState(false);

  const cutoff = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString();
  }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (!mostraTutto) r = r.filter((x) => (x.data_chiusura ?? x.created_at) >= cutoff);
    if (meseFiltro !== "ultimi3" && meseFiltro !== "tutto") {
      r = r.filter((x) => (x.data_chiusura ?? x.created_at)?.slice(0, 7) === meseFiltro);
    }
    return r;
  }, [rows, mostraTutto, meseFiltro, cutoff]);

  const mesi = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { const k = (r.data_chiusura ?? r.created_at)?.slice(0, 7); if (k) s.add(k); });
    return Array.from(s).sort().reverse();
  }, [rows]);

  if (loading) return <SkeletonTable />;

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={meseFiltro} onValueChange={setMeseFiltro}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ultimi3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="tutto">Tutti i mesi</SelectItem>
            {mesi.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {!mostraTutto && (
          <Button variant="outline" size="sm" onClick={() => setMostraTutto(true)}>Carica tutto lo storico</Button>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Empty label={kind === "approvata" ? "Nessuna richiesta approvata" : "Nessuna richiesta rifiutata"} hint="" />
      ) : (
        <Card className="p-2 sm:p-3">
          <ElencoSchede>
            {filtered.map((r) => {
              const se = r.stato_export as ("da_esportare"|"esportata"|"processata"|"errore_export"|null);
              const exportLabel: Record<string,string> = { da_esportare:"Da esportare", esportata:"Esportata", processata:"Processata", errore_export:"Errore" };
              const exportTone: Record<string,string> = { da_esportare:"bg-info/15 text-info", esportata:"bg-warning/15 text-warning", processata:"bg-success/15 text-success", errore_export:"bg-destructive/15 text-destructive" };
              return (
                <SchedaLista
                  key={r.id}
                  onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
                  colonneCampi={2}
                  titolo={<span className="inline-flex items-start gap-2 min-w-0"><SemaforoPallino cliente={r.clienti} className="mt-1.5" /><span className="min-w-0 break-words">{r.clienti?.ragione_sociale ?? "—"}</span></span>}
                  badge={<span className="inline-flex flex-wrap items-center justify-end gap-1"><span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span>}
                  campi={[
                    { etichetta: "Importo rich.", valore: <span className="tabular-nums">{formatEuro(Number(r.importo_richiesto))}</span> },
                    ...(kind === "approvata" ? [{ etichetta: "Importo appr.", valore: mapRichiestaFido(r).soloCondizione ? <span className="text-muted-foreground">solo cond. pag.</span> : <span className="tabular-nums text-success font-medium">{formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}</span> }] : []),
                    ...(kind === "rifiutata" ? [{ etichetta: "Motivo", valore: <span className="break-words">{r.note ?? r.motivazione ?? "—"}</span> }] : []),
                    { etichetta: "Richiesto da", valore: userName((r as any).richiedente) },
                    { etichetta: kind === "approvata" ? "Approvato da" : "Deciso da", valore: userName((r as any).approvatore) },
                    { etichetta: "Data", valore: formatDate(r.data_chiusura ?? r.created_at) },
                  ]}
                  footer={
                    <>
                      {kind === "approvata" && se && <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${exportTone[se]}`}>{exportLabel[se]}</span>}
                      {(msgCounts?.[r.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>}
                    </>
                  }
                />
              );
            })}
          </ElencoSchede>
          <div className="hidden md:block">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-16 text-center">Rischio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Importo richiesto</TableHead>
                {kind === "approvata" && <TableHead className="text-right">Importo approvato</TableHead>}
                {kind === "approvata" && <TableHead>Export</TableHead>}
                {kind === "rifiutata" && <TableHead>Motivo</TableHead>}
                <TableHead>Richiesto da</TableHead>
                <TableHead>{kind === "approvata" ? "Approvato da" : "Decisione di"}</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const se = r.stato_export as ("da_esportare"|"esportata"|"processata"|"errore_export"|null);
                const exportLabel: Record<string,string> = { da_esportare:"Da esportare", esportata:"Esportata", processata:"Processata", errore_export:"Errore" };
                const exportTone: Record<string,string> = { da_esportare:"bg-info/15 text-info", esportata:"bg-warning/15 text-warning", processata:"bg-success/15 text-success", errore_export:"bg-destructive/15 text-destructive" };
                return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } });
                  }}
                >
                  <TableCell className="font-medium">
                    <div className="inline-flex items-center gap-2">
                      {r.clienti?.ragione_sociale ?? "—"}
                      {(msgCounts?.[r.id] ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                          <MessageSquare className="size-3" />
                          {msgCounts![r.id]}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><SemaforoPallino cliente={r.clienti} /></TableCell>
                  <TableCell><span className="inline-flex flex-wrap items-center gap-1"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span></TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                  {kind === "approvata" && (mapRichiestaFido(r).soloCondizione
                    ? <TableCell className="text-right text-xs text-muted-foreground">solo cond. pag.</TableCell>
                    : <TableCell className="text-right tabular-nums text-success font-medium">{formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}</TableCell>)}
                  {kind === "approvata" && (
                    <TableCell>
                      {se ? <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${exportTone[se]}`}>{exportLabel[se]}</span> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {kind === "rifiutata" && <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.note ?? r.motivazione ?? ""}>{r.note ?? r.motivazione ?? "—"}</TableCell>}
                  <TableCell className="text-sm">{userName((r as any).richiedente)}</TableCell>
                  <TableCell className="text-sm">{userName((r as any).approvatore)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.data_chiusura ?? r.created_at)}</TableCell>

                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============================ TUTTO TAB (admin) ============================ */
function TuttoTab({ rows, loading, msgCounts }: { rows: any[]; loading: boolean; msgCounts?: Record<string, number> }) {
  const navigate = useNavigate();
  const [statoF, setStatoF] = useState<string>("tutti");
  const [livF, setLivF] = useState<string>("tutti");
  const filtered = rows
    .filter((r) => statoF === "tutti" || r.stato === statoF)
    .filter((r) => livF === "tutti" || String(r.livello_corrente) === livF);

  if (loading) return <SkeletonTable />;
  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={statoF} onValueChange={setStatoF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {Object.entries(STATO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={livF} onValueChange={setLivF}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Livello" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i livelli</SelectItem>
            <SelectItem value="1">Liv. 1</SelectItem>
            <SelectItem value="2">Liv. 2</SelectItem>
            <SelectItem value="3">Liv. 3</SelectItem>
          </SelectContent>
        </Select>
      </Card>
      <Card className="p-2 sm:p-3">
        <ElencoSchede>
          {filtered.map((r) => (
            <SchedaLista
              key={r.id}
              onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
              colonneCampi={2}
              titolo={<span className="inline-flex items-start gap-2 min-w-0"><SemaforoPallino cliente={r.clienti} className="mt-1.5" /><span className="min-w-0 break-words">{r.clienti?.ragione_sociale ?? "—"}</span></span>}
              badge={<span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span>}
              campi={[
                { etichetta: "Store", valore: r.clienti?.stores?.nome ?? "—" },
                { etichetta: "Importo", valore: <span className="tabular-nums">{formatEuro(Number(r.importo_richiesto))}</span> },
                { etichetta: "Liv.", valore: `L${r.livello_corrente}/${r.livello_richiesto}` },
                { etichetta: "Richiesto da", valore: userName((r as any).richiedente) },
                { etichetta: "Approvato da", valore: userName((r as any).approvatore) },
                { etichetta: "Data", valore: formatDate(r.created_at) },
              ]}
              footer={
                <>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span>
                  <CambioCondizionePagamento variant="badge" richiesta={r} />
                  {(msgCounts?.[r.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>}
                </>
              }
            />
          ))}
        </ElencoSchede>
        <div className="hidden md:block">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
                <TableHead className="w-16 text-center">Rischio</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Liv.</TableHead>
              <TableHead>Richiesto da</TableHead>
              <TableHead>Approvato da</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
              >
                <TableCell className="font-medium">
                  <div className="inline-flex items-center gap-2">
                    {r.clienti?.ragione_sociale ?? "—"}
                    {(msgCounts?.[r.id] ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium">
                        <MessageSquare className="size-3" />
                        {msgCounts![r.id]}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center"><SemaforoPallino cliente={r.clienti} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.clienti?.stores?.nome ?? "—"}</TableCell>
                <TableCell><span className="inline-flex flex-wrap items-center gap-1"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /></span></TableCell>
                <TableCell className="text-right tabular-nums">{formatEuro(Number(r.importo_richiesto))}</TableCell>
                <TableCell><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span></TableCell>
                <TableCell><Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge></TableCell>
                <TableCell className="text-sm">{userName((r as any).richiedente)}</TableCell>
                <TableCell className="text-sm">{userName((r as any).approvatore)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ helpers ============================ */
function SkeletonTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

function Empty({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="p-10 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium text-sm">{label}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}
