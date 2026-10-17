// Pagina "Promesse di pagamento" (menu Recupero crediti).
// Promessa = azioni_recupero con esito 'promessa_pagamento'. Visibilità: RLS esistenti.
// Importo efficace: promesse_attive_importo_efficace() (fonte unica DB, non ricalcolato qui).
// Previsione: get_previsione_incassi_coperture (riga origine='promessa').
import { useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, HandCoins, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { useNomiUtenti } from "@/hooks/use-nomi-utenti";
import { FiltriCollassabili } from "@/components/lista-responsive";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeStatoPromessa, SelettoreStatoPromessa, STATI_PROMESSA } from "@/components/stato-promessa";

export const Route = createFileRoute("/_app/recupero-crediti-promesse")({
  head: () => ({
    meta: [
      { title: "Promesse di pagamento — FidiManager" },
      { name: "description", content: "Elenco e stato delle promesse di pagamento dei clienti." },
      { property: "og:title", content: "Promesse di pagamento — FidiManager" },
      { property: "og:description", content: "Elenco e stato delle promesse di pagamento dei clienti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // ?daVerificare=true (link dallo Scadenziario): apre la lista già filtrata sulle promesse da verificare.
  validateSearch: (s: Record<string, unknown>): { daVerificare?: boolean } =>
    s.daVerificare === true || s.daVerificare === "true" ? { daVerificare: true } : {},
  component: PromessePage,
});

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(v));
const eur0 = (v: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v ?? 0));
const fmtD = (s: string | null | undefined) => (s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("it-IT") : "—");

function oggiISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function giorniDa(iso: string): number {
  const a = new Date(iso.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(oggiISO() + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

type Row = {
  id: string;
  cliente_id: string;
  ragione_sociale: string;
  store_id: string | null;
  codice_agente: string | null;
  operatore_id: string | null;
  created_at: string;
  data_promessa: string | null;
  importo: number | null;
  stato: string;
  n_fatture: number;
  efficace: number | null;
};

type SortKey = "cliente" | "negozio" | "data" | "importo" | "stato" | "inserita";

function PromessePage() {
  const { user } = useAuth();
  const { nomeUtente } = useNomiUtenti();
  const { daVerificare: daVerificareUrl } = Route.useSearch();
  const { filtri, setCampo, setParziale } = useFiltriPagina("recupero-crediti-promesse", {
    stato: "attiva", negozio: "tutti", agente: "tutti", search: "", soloDaVerificare: false,
    sortKey: "data" as SortKey, sortDir: "asc" as "asc" | "desc",
  }, { userId: user?.id });
  const { stato, negozio, agente, search, soloDaVerificare, sortKey, sortDir } = filtri;
  useEffect(() => {
    if (daVerificareUrl) setParziale({ stato: "attiva", soloDaVerificare: true });
  }, [daVerificareUrl, setParziale]);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-lista-nomi"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return data ?? [];
    },
  });
  const storeNome = useMemo(() => new Map(stores.map((s) => [s.id, s.nome as string])), [stores]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["promesse-pagamento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero")
        .select("id, cliente_id, operatore_id, created_at, data_promessa_pagamento, importo_riferimento, stato_promessa, cliente:clienti!inner(id, ragione_sociale, store_id, codice_agente), ponti:azioni_recupero_scadenze(count)" as never)
        .eq("esito", "promessa_pagamento")
        .order("data_promessa_pagamento", { ascending: true });
      if (error) throw error;
      const { data: eff } = await supabase.rpc("promesse_attive_importo_efficace" as never);
      const effMap = new Map<string, number>();
      for (const e of (eff ?? []) as unknown as { promessa_id: string; importo_efficace: number }[]) {
        effMap.set(e.promessa_id, Number(e.importo_efficace));
      }
      type Raw = {
        id: string; cliente_id: string; operatore_id: string | null; created_at: string;
        data_promessa_pagamento: string | null; importo_riferimento: number | null; stato_promessa: string | null;
        cliente: { ragione_sociale: string; store_id: string | null; codice_agente: string | null };
        ponti: { count: number }[] | null;
      };
      return ((data ?? []) as unknown as Raw[]).map<Row>((r) => ({
        id: r.id,
        cliente_id: r.cliente_id,
        ragione_sociale: r.cliente.ragione_sociale,
        store_id: r.cliente.store_id,
        codice_agente: r.cliente.codice_agente,
        operatore_id: r.operatore_id,
        created_at: r.created_at,
        data_promessa: r.data_promessa_pagamento,
        importo: r.importo_riferimento != null ? Number(r.importo_riferimento) : null,
        stato: r.stato_promessa ?? "attiva",
        n_fatture: r.ponti?.[0]?.count ?? 0,
        efficace: effMap.has(r.id) ? effMap.get(r.id)! : null,
      }));
    },
  });

  const pStore = negozio === "tutti" ? null : negozio;
  const pAgente = agente === "tutti" ? null : agente;
  const { data: previsione } = useQuery({
    queryKey: ["promesse-previsione", pStore, pAgente],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_previsione_incassi_coperture" as never, { p_store_id: pStore, p_agente: pAgente } as never);
      if (error) throw error;
      const r = ((data ?? []) as unknown as Array<Record<string, number | string | null>>).find((x) => x.origine === "promessa");
      return r ?? null;
    },
  });

  const oggi = oggiISO();
  const daVerificare = (r: Row) => r.stato === "attiva" && !!r.data_promessa && r.data_promessa < oggi;

  // Perimetro (negozio, agente, ricerca): base degli indicatori.
  const perimetro = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (pStore && r.store_id !== pStore) return false;
      if (pAgente && (pAgente === "__none__" ? r.codice_agente != null : r.codice_agente !== pAgente)) return false;
      if (q && !r.ragione_sociale.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, pStore, pAgente, search]);

  const kpi = useMemo(() => {
    const att = perimetro.filter((r) => r.stato === "attiva");
    return {
      nAtt: att.length,
      impAtt: att.reduce((a, r) => a + (r.efficace ?? r.importo ?? 0), 0),
      nVer: att.filter(daVerificare).length,
      nMan: perimetro.filter((r) => r.stato === "mantenuta").length,
      nDis: perimetro.filter((r) => r.stato === "disattesa").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perimetro, oggi]);

  const elenco = useMemo(() => {
    const arr = perimetro.filter((r) => {
      if (stato !== "tutti" && r.stato !== stato) return false;
      if (soloDaVerificare && !daVerificare(r)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "cliente": return dir * a.ragione_sociale.localeCompare(b.ragione_sociale);
        case "negozio": return dir * (storeNome.get(a.store_id ?? "") ?? "").localeCompare(storeNome.get(b.store_id ?? "") ?? "");
        case "importo": return dir * ((a.importo ?? 0) - (b.importo ?? 0));
        case "stato": return dir * a.stato.localeCompare(b.stato);
        case "inserita": return dir * a.created_at.localeCompare(b.created_at);
        case "data":
        default: return dir * (a.data_promessa ?? "9999").localeCompare(b.data_promessa ?? "9999");
      }
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perimetro, stato, soloDaVerificare, sortKey, sortDir, storeNome, oggi]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setCampo("sortDir", sortDir === "asc" ? "desc" : "asc");
    else { setCampo("sortKey", k); setCampo("sortDir", "asc"); }
  }
  const filtriAttivi = [stato !== "attiva", negozio !== "tutti", agente !== "tutti", !!search, soloDaVerificare].filter(Boolean).length;

  function Th({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) {
    const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={`cursor-pointer select-none ${right ? "text-right" : ""}`} onClick={() => toggleSort(k)}>
        <span className="inline-flex items-center gap-1">{children}{sortKey === k && <Icon className="size-3" />}</span>
      </TableHead>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <HandCoins className="size-7 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold">Promesse di pagamento</h1>
          <p className="text-sm text-muted-foreground">Impegni di pagamento presi dai clienti e loro esito</p>
        </div>
      </div>

      <Card className="p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicatore etichetta="Promesse attive" valore={String(kpi.nAtt)} sotto={eur0(kpi.impAtt)} />
          <Indicatore etichetta="Da verificare" valore={String(kpi.nVer)} sotto="attive con data passata" cls={kpi.nVer > 0 ? "text-destructive" : ""} />
          <Indicatore etichetta="Mantenute" valore={String(kpi.nMan)} cls="text-emerald-700 dark:text-emerald-400" />
          <Indicatore etichetta="Disattese" valore={String(kpi.nDis)} cls={kpi.nDis > 0 ? "text-destructive" : ""} />
        </div>
        {previsione && <BarraPrevisione p={previsione} />}
      </Card>

      <Card className="p-3 sm:p-4">
        <FiltriCollassabili attivi={filtriAttivi}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 items-center">
            <div className="relative min-w-0">
              <Search className="size-4 absolute left-2.5 top-3 text-muted-foreground" />
              <Input placeholder="Cerca cliente…" value={search} onChange={(e) => setCampo("search", e.target.value)} className="pl-8 h-10" />
            </div>
            <Select value={stato} onValueChange={(v) => setCampo("stato", v)}>
              <SelectTrigger className="h-10 lg:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                {STATI_PROMESSA.map((s) => <SelectItem key={s.value} value={s.value}>{s.label === "Attiva" ? "Attive" : s.label === "Mantenuta" ? "Mantenute" : s.label === "Disattesa" ? "Disattese" : "Annullate"}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={negozio} onValueChange={(v) => setCampo("negozio", v)}>
              <SelectTrigger className="h-10 lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i negozi</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={agente} onValueChange={(v) => setCampo("agente", v)}>
              <SelectTrigger className="h-10 lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                <SelectItem value="__none__">Senza agente</SelectItem>
                {agenti.map((a) => <SelectItem key={a.codice} value={a.codice}>{a.descrizione}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 h-10">
              <Switch id="solo-ver" checked={soloDaVerificare} onCheckedChange={(v) => setCampo("soloDaVerificare", v)} />
              <Label htmlFor="solo-ver" className="text-sm">Solo da verificare</Label>
            </div>
          </div>
        </FiltriCollassabili>
      </Card>

      {isLoading ? <Skeleton className="h-64" /> : elenco.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nessuna promessa trovata.</Card>
      ) : (
        <>
          {/* Telefono / tablet: schede compatte */}
          <div className="md:hidden space-y-2">
            {elenco.map((r) => (
              <Card key={r.id} className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} search={{ tab: "attivita" } as never}
                    className="font-medium text-sm text-primary hover:underline break-words line-clamp-2 min-w-0">
                    {r.ragione_sociale}
                  </Link>
                  <SelettoreStatoPromessa azioneId={r.id} clienteId={r.cliente_id} stato={r.stato} className="shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <DataPromessa r={r} verifica={daVerificare(r)} />
                  <Importo r={r} />
                </div>
                <div className="text-xs text-muted-foreground break-words">
                  {storeNome.get(r.store_id ?? "") ?? "—"} · {r.n_fatture} fatt. · {nomeUtente(r.operatore_id) ?? "—"} il {fmtD(r.created_at)}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: tabella ordinabile */}
          <Card className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th k="cliente">Cliente</Th>
                  <Th k="negozio">Negozio</Th>
                  <Th k="data">Data promessa</Th>
                  <Th k="importo" right>Importo</Th>
                  <TableHead className="text-right">Fatture</TableHead>
                  <Th k="inserita">Inserita da</Th>
                  <Th k="stato">Stato</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {elenco.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[280px]">
                      <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} search={{ tab: "attivita" } as never}
                        className="font-medium text-primary hover:underline break-words line-clamp-2">
                        {r.ragione_sociale}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{storeNome.get(r.store_id ?? "") ?? "—"}</TableCell>
                    <TableCell><DataPromessa r={r} verifica={daVerificare(r)} /></TableCell>
                    <TableCell className="text-right"><Importo r={r} align="end" /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.n_fatture}</TableCell>
                    <TableCell className="text-sm">
                      <div>{nomeUtente(r.operatore_id) ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{fmtD(r.created_at)}</div>
                    </TableCell>
                    <TableCell><SelettoreStatoPromessa azioneId={r.id} clienteId={r.cliente_id} stato={r.stato} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Indicatore({ etichetta, valore, sotto, cls }: { etichetta: string; valore: string; sotto?: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{etichetta}</div>
      <div className={`text-lg sm:text-xl font-semibold tabular-nums ${cls ?? ""}`}>{valore}</div>
      {sotto && <div className="text-xs text-muted-foreground tabular-nums break-words">{sotto}</div>}
    </div>
  );
}

function DataPromessa({ r, verifica }: { r: Row; verifica: boolean }) {
  if (!r.data_promessa) return <span className="text-muted-foreground">—</span>;
  const gg = giorniDa(r.data_promessa);
  return (
    <span className={`tabular-nums ${verifica ? "text-destructive font-medium" : ""}`}>
      {fmtD(r.data_promessa)}
      {verifica && <span className="text-xs"> · da {gg} {gg === 1 ? "giorno" : "giorni"}</span>}
    </span>
  );
}

function Importo({ r, align }: { r: Row; align?: "end" }) {
  if (r.importo == null || r.importo <= 0) {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">Senza importo</Badge>;
  }
  const diverso = r.stato === "attiva" && r.efficace != null && Math.abs(r.efficace - r.importo) >= 0.01;
  return (
    <span className={`inline-flex flex-col ${align === "end" ? "items-end" : ""}`}>
      <span className="font-medium tabular-nums">{eur(r.importo)}</span>
      {diverso && (
        <span className="text-xs text-muted-foreground tabular-nums">coperti {eur0(r.efficace)} su {eur0(r.importo)} promessi</span>
      )}
    </span>
  );
}

function BarraPrevisione({ p }: { p: Record<string, number | string | null> }) {
  const parti = [
    { k: "scaduto_non_incassato", label: "Data passata", cls: "bg-destructive" },
    { k: "entro_30", label: "Entro 30 gg", cls: "bg-primary" },
    { k: "entro_60", label: "Entro 60 gg", cls: "bg-primary/70" },
    { k: "entro_90", label: "Entro 90 gg", cls: "bg-primary/45" },
    { k: "oltre_90", label: "Oltre", cls: "bg-primary/25" },
  ].map((x) => ({ ...x, v: Number(p[x.k] ?? 0) }));
  const tot = parti.reduce((a, x) => a + x.v, 0);
  const medio = p.giorni_medi_rientro != null ? Math.round(Number(p.giorni_medi_rientro)) : null;
  return (
    <div className="space-y-1.5 border-t pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium text-sm">Previsione d'incasso promesse · {eur0(Number(p.totale_atteso ?? tot))}</span>
        {medio != null && <span className="text-muted-foreground">rientro medio {medio} giorni</span>}
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {tot > 0 && parti.map((x) => x.v > 0 && (
          <div key={x.k} className={x.cls} style={{ width: `${(x.v / tot) * 100}%` }} title={`${x.label}: ${eur0(x.v)}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 text-xs">
        {parti.map((x) => (
          <div key={x.k} className="flex items-center gap-1.5 min-w-0">
            <span className={`size-2 rounded-full shrink-0 ${x.cls}`} />
            <span className="text-muted-foreground truncate">{x.label}</span>
            <span className="ml-auto tabular-nums font-medium">{eur0(x.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
