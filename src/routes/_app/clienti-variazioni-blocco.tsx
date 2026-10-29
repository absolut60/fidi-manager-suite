import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";

export const Route = createFileRoute("/_app/clienti-variazioni-blocco")({
  component: ClientiVariazioniBloccoPage,
});

const PER_PAGE = 50;

type Periodo = "7g" | "30g" | "tutto";

const PERIODI: Periodo[] = ["7g", "30g", "tutto"];
const ETICHETTE_PERIODO: Record<Periodo, string> = {
  "7g": "Ultimi 7 giorni",
  "30g": "Ultimi 30 giorni",
  tutto: "Tutto",
};

/**
 * Soglia minima per `rilevato_at` (ISO UTC) del periodo scelto; null = tutto
 * lo storico. Unica fonte: la usano la query e, se servirà altrove, l'etichetta.
 */
function sogliaPeriodo(periodo: Periodo): string | null {
  const giorni = periodo === "7g" ? 7 : periodo === "30g" ? 30 : null;
  if (giorni === null) return null;
  return new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString();
}


type VariazioneRow = {
  id: string;
  cliente_id: string;
  store_id: string | null;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tipo: string | null;
  rilevato_at: string | null;
  stores: { nome: string | null } | null;
};

function fmtDataOra(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(String(v));
    const data = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
    const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    return `${data} ${ora}`;
  } catch {
    return String(v);
  }
}

function BadgeVariazione({ tipo }: { tipo: string | null }) {
  if (tipo === "bloccato") return <Badge variant="destructive">Bloccato</Badge>;
  if (tipo === "sbloccato") return <Badge className="bg-emerald-600/15 text-emerald-700">Sbloccato</Badge>;
  if (tipo === "in_legale") return <Badge className="bg-amber-500/15 text-amber-700">In legale</Badge>;
  if (tipo === "uscito_legale") return <Badge className="bg-emerald-500/10 text-emerald-600">Uscito dal legale</Badge>;
  return <Badge variant="outline">{tipo ?? "—"}</Badge>;
}

function ClientiVariazioniBloccoPage() {
  const navigate = useNavigate();
  // Filtri e pagina conservati (useFiltriPagina).
  const { user } = useAuth();
  const { filtri: FV, setCampo } = useFiltriPagina("clienti-variazioni-blocco", {
    tipo: [] as string[], search: "", storeId: [] as string[], pagina: 0,
    periodo: "7g" as Periodo,
  }, { userId: user?.id, valida: { tipo: Array.isArray, storeId: Array.isArray, periodo: (v) => v === "7g" || v === "30g" || v === "tutto" } });
  const { tipo, search, pagina, periodo } = FV;
  const setPeriodo = (v: Periodo) => setCampo("periodo", v);

  const setTipo = (v: string[]) => setCampo("tipo", v);
  const setSearch = (v: string) => setCampo("search", v);
  const setStoreId = (v: string[]) => setCampo("storeId", v);
  const setPagina = (v: number | ((p: number) => number)) => setCampo("pagina", v);
  const [qApplied, setQApplied] = useState(() => FV.search.trim());

  // Ricerca con debounce: aggiorna la query lato server solo dopo una pausa.
  // La pagina torna a 0 solo se la ricerca applicata cambia davvero (non al montaggio).
  useEffect(() => {
    const t = setTimeout(() => {
      const nuova = search.trim();
      setQApplied((prev) => {
        if (prev !== nuova) setPagina(0);
        return nuova;
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);


  // Negozi presenti nei dati visibili (scoped dalle RLS): il filtro Negozio
  // compare solo se compaiono più negozi (per uno store manager non serve).
  const { data: negozi } = useQuery({
    queryKey: ["clienti-variazioni-blocco-negozi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti_blocco_variazioni")
        .select("store_id, stores(nome)");
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        if (r.store_id && r.stores?.nome) m.set(r.store_id, r.stores.nome);
      });
      return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    },
  });
  const showStoreFilter = (negozi?.length ?? 0) > 1;
  // Filtro negozio non visibile (un solo negozio): il valore salvato non si applica.
  const storeId = showStoreFilter ? FV.storeId : [];

  const attiviCount = [
    tipo.length > 0,
    qApplied !== "",
    storeId.length > 0,
  ].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["clienti-variazioni-blocco", tipo, qApplied, storeId, pagina, periodo],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const soglia = sogliaPeriodo(periodo);
      let q = supabase
        .from("clienti_blocco_variazioni")
        .select("id, cliente_id, store_id, codice_gestionale, ragione_sociale, tipo, rilevato_at, stores(nome)", { count: "exact" })
        .order("rilevato_at", { ascending: false })
        .range(pagina * PER_PAGE, pagina * PER_PAGE + PER_PAGE - 1);
      if (soglia) q = q.gte("rilevato_at", soglia);
      if (tipo.length > 0) q = q.in("tipo", tipo);

      if (storeId.length > 0) q = q.in("store_id", storeId);
      if (qApplied) {
        q = q.or(`codice_gestionale.ilike.%${qApplied}%,ragione_sociale.ilike.%${qApplied}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { righe: (data ?? []) as VariazioneRow[], totale: count ?? 0 };
    },
  });

  const righe = data?.righe ?? [];
  const totale = data?.totale ?? 0;
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGE));

  const vaiACliente = (clienteId: string) =>
    navigate({ to: "/clienti/$clienteId", params: { clienteId } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="size-7 text-primary" /> Variazioni blocco e legale clienti
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clienti bloccati, sbloccati, entrati o usciti dalla gestione legale.
        </p>
      </div>

      <Card className="p-4">
        {/* Periodo: sempre visibile, fuori da FiltriCollassabili (non conta tra i filtri attivi). */}
        <div role="group" aria-label="Periodo" className="grid grid-cols-3 gap-1 mb-3">
          {PERIODI.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={periodo === p ? "default" : "outline"}
              aria-pressed={periodo === p}
              onClick={() => { setPeriodo(p); setPagina(0); }}
              className="min-h-10 h-auto px-1 py-2 leading-tight text-xs sm:text-sm whitespace-normal"
            >
              {ETICHETTE_PERIODO[p]}
            </Button>
          ))}
        </div>
        <FiltriCollassabili attivi={attiviCount}>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] sm:flex-none sm:w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca codice o ragione sociale..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full sm:w-44">
              <FiltroMultiplo
                etichetta="Tipo" testoTutti="Tutte"
                opzioni={[
                  { valore: "bloccato", label: "Bloccati" },
                  { valore: "sbloccato", label: "Sbloccati" },
                  { valore: "in_legale", label: "Entrati in legale" },
                  { valore: "uscito_legale", label: "Usciti dal legale" },
                ]}
                selezionati={tipo} onChange={(v) => { setTipo(v); setPagina(0); }}
              />
            </div>
            {showStoreFilter && (
              <div className="w-full sm:w-52">
                <FiltroMultiplo
                  etichetta="Negozio" testoTutti="Tutti i negozi"
                  opzioni={(negozi ?? []).map(([id, nome]) => ({ valore: id, label: nome }))}
                  selezionati={storeId} onChange={(v) => { setStoreId(v); setPagina(0); }}
                />
              </div>
            )}
          </div>
        </FiltriCollassabili>
        <p className="text-sm text-muted-foreground mt-2">
          {totale === 1 ? "1 variazione" : `${totale} variazioni`}
        </p>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : righe.length === 0 ? (
          periodo === "tutto" ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nessuna variazione registrata. Le variazioni di blocco arrivano dagli import dal gestionale; quelle legali anche dalle pratiche legali.
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nessuna variazione {periodo === "7g" ? "negli ultimi 7 giorni" : "negli ultimi 30 giorni"}. Le variazioni di blocco arrivano dagli import, quelle legali anche dalle pratiche.
              </p>
              <Button
                variant="outline" size="sm" className="min-h-10"
                onClick={() => { setPeriodo("tutto"); setPagina(0); }}
              >
                Mostra tutto
              </Button>
            </div>
          )
        ) : (

          <>
            {/* Mobile: schede al posto della tabella */}
            <div className="md:hidden p-3">
              <ElencoSchede>
                {righe.map((r) => (
                  <SchedaLista
                    key={r.id}
                    onClick={() => vaiACliente(r.cliente_id)}
                    colonneCampi={1}
                    titolo={r.ragione_sociale ?? "—"}
                    campi={[
                      { etichetta: "Codice", valore: r.codice_gestionale ?? "—" },
                      { etichetta: "Negozio", valore: r.stores?.nome ?? "—" },
                      { etichetta: "Data rilevamento", valore: fmtDataOra(r.rilevato_at) },
                    ]}
                    footer={<BadgeVariazione tipo={r.tipo} />}
                  />
                ))}
              </ElencoSchede>
            </div>

            {/* Desktop: tabella */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data rilevamento</TableHead>
                    <TableHead>Negozio</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Ragione sociale</TableHead>
                    <TableHead>Variazione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righe.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => vaiACliente(r.cliente_id)}
                    >
                      <TableCell className="whitespace-nowrap">{fmtDataOra(r.rilevato_at)}</TableCell>
                      <TableCell>{r.stores?.nome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.codice_gestionale ?? "—"}</TableCell>
                      <TableCell className="font-medium min-w-0 break-words">{r.ragione_sociale ?? "—"}</TableCell>
                      <TableCell><BadgeVariazione tipo={r.tipo} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totale > PER_PAGE && (
              <div className="flex items-center justify-between gap-2 p-3 border-t">
                <Button
                  variant="outline" size="sm" className="min-h-10"
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                >
                  Precedente
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {pagina + 1} di {totalePagine}
                </span>
                <Button
                  variant="outline" size="sm" className="min-h-10"
                  disabled={(pagina + 1) * PER_PAGE >= totale}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Successiva
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
