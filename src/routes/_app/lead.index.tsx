import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Search, Users, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, X, CalendarClock,
} from "lucide-react";
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
import {
  LEAD_STATI, LEAD_STATO_LABEL, LEAD_STATO_CLASS,
  LEAD_TIPI, LEAD_TIPO_LABEL, LEAD_FONTI, LEAD_FONTE_LABEL,
  LEAD_PRIORITA, LEAD_PRIORITA_LABEL, LEAD_PRIORITA_CLASS,
  nomeLead, formatData, puoAccedereLead,
} from "@/lib/lead-costanti";

export const Route = createFileRoute("/_app/lead/")({
  component: LeadListaPage,
});

const TUTTI = "tutti";
const NESSUNO = "__none__";

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
};

function LeadListaPage() {
  const navigate = useNavigate();
  const { roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);

  const [tab, setTab] = useState<"tutti" | "ricontattare">("tutti");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stato, setStato] = useState(TUTTI);
  const [tipoLead, setTipoLead] = useState(TUTTI);
  const [fonte, setFonte] = useState(TUTTI);
  const [priorita, setPriorita] = useState(TUTTI);
  const [storeFiltro, setStoreFiltro] = useState(TUTTI);
  const [agente, setAgente] = useState(TUTTI);
  const [assegnatario, setAssegnatario] = useState(TUTTI);
  const [giorni, setGiorni] = useState("0");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const nomeProfilo = (id: string | null) => {
    if (!id) return "—";
    const p = profili?.find((x) => x.id === id);
    return p ? `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—" : "—";
  };
  const nomeStore = (id: string | null) => stores?.find((s) => s.id === id)?.nome ?? "—";

  const attiviCount = [stato, tipoLead, fonte, priorita, storeFiltro, agente, assegnatario]
    .filter((v) => v !== TUTTI).length + (search ? 1 : 0);

  function resetFiltri() {
    setStato(TUTTI); setTipoLead(TUTTI); setFonte(TUTTI); setPriorita(TUTTI);
    setStoreFiltro(TUTTI); setAgente(TUTTI); setAssegnatario(TUTTI);
    setSearch(""); setSearchInput(""); setPage(1);
  }

  const limiteData = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Number(giorni || 0));
    return d.toISOString().slice(0, 10);
  }, [giorni]);

  const queryKey = [
    "lead-lista", tab, search, stato, tipoLead, fonte, priorita, storeFiltro, agente,
    assegnatario, page, pageSize, sortBy, sortDir, tab === "ricontattare" ? limiteData : null,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: canSee,
    queryFn: async () => {
      let q = supabase
        .from("lead")
        .select(
          "id, ragione_sociale, nome, cognome, tipo_soggetto, stato, tipo_lead, priorita, fonte, citta, provincia, store_id, agente_codice, assegnato_a, prossima_azione_il, created_at",
          { count: "exact" },
        );

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
      if (stato !== TUTTI) q = q.eq("stato", stato as LeadRow["stato"]);
      if (tipoLead !== TUTTI) q = q.eq("tipo_lead", tipoLead as LeadRow["tipo_lead"]);
      if (fonte !== TUTTI) q = q.eq("fonte", fonte as LeadRow["fonte"]);
      if (priorita !== TUTTI) q = q.eq("priorita", priorita as LeadRow["priorita"]);
      if (storeFiltro !== TUTTI) {
        if (storeFiltro === NESSUNO) q = q.is("store_id", null);
        else q = q.eq("store_id", storeFiltro);
      }
      if (agente !== TUTTI) {
        if (agente === NESSUNO) q = q.is("agente_codice", null);
        else q = q.eq("agente_codice", agente);
      }
      if (assegnatario !== TUTTI) {
        if (assegnatario === NESSUNO) q = q.is("assegnato_a", null);
        else q = q.eq("assegnato_a", assegnatario);
      }

      if (tab === "ricontattare") {
        q = q.not("prossima_azione_il", "is", null).lte("prossima_azione_il", limiteData);
        q = q.order("prossima_azione_il", { ascending: true });
      } else {
        q = q.order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await q.range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as LeadRow[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const totale = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totale / pageSize));

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }

  function SortHeader({ col, label }: { col: string; label: string }) {
    const active = sortBy === col && tab === "tutti";
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
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
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

      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="tutti">Tutti i lead</TabsTrigger>
          <TabsTrigger value="ricontattare" className="gap-1.5">
            <CalendarClock className="size-4" /> Da ricontattare
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-muted-foreground">Filtri</div>
          <div className="flex items-center gap-2">
            {attiviCount > 0 && (
              <>
                <Badge variant="secondary" className="h-6">
                  {attiviCount} {attiviCount === 1 ? "filtro attivo" : "filtri attivi"}
                </Badge>
                <Button variant="ghost" size="sm" onClick={resetFiltri} className="gap-1 h-7">
                  <X className="size-3.5" /> Azzera tutti
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
            <Select value={stato} onValueChange={(v) => { setStato(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                {LEAD_STATI.map((s) => <SelectItem key={s} value={s}>{LEAD_STATO_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <Label className="text-xs">Sede</Label>
            <Select value={storeFiltro} onValueChange={(v) => { setStoreFiltro(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutte</SelectItem>
                <SelectItem value={NESSUNO}>Senza sede</SelectItem>
                {(stores ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agente</Label>
            <Select value={agente} onValueChange={(v) => { setAgente(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                <SelectItem value={NESSUNO}>Senza agente</SelectItem>
                {(agenti ?? []).map((a) => (
                  <SelectItem key={a.codice} value={a.codice}>{a.descrizione || a.codice}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assegnatario</Label>
            <Select value={assegnatario} onValueChange={(v) => { setAssegnatario(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti</SelectItem>
                <SelectItem value={NESSUNO}>Non assegnati</SelectItem>
                {(profili ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {`${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

        <div className="mb-3 text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Pagina <strong className="text-foreground">{page}</strong> di <strong className="text-foreground">{totalPages}</strong>
            <span className="ml-1">— <strong className="text-foreground">{totale}</strong> lead</span>
          </span>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader col="ragione_sociale" label="Nominativo" /></TableHead>
                  <TableHead>Tipo soggetto</TableHead>
                  <TableHead><SortHeader col="stato" label="Stato" /></TableHead>
                  <TableHead>Tipo lead</TableHead>
                  <TableHead><SortHeader col="priorita" label="Priorità" /></TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Sede / Agente</TableHead>
                  <TableHead>Assegnato a</TableHead>
                  <TableHead><SortHeader col="prossima_azione_il" label="Prossima azione" /></TableHead>
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
                    <TableCell className="text-xs">{formatData(l.prossima_azione_il)}</TableCell>
                    <TableCell className="text-xs">{formatData(l.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
