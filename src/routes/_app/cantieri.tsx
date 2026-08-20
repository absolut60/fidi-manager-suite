// Modulo commerciale — Cantieri: lista con stato geocodifica e mappa Google.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Building2, MapPin, MapPinned, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltriCollassabili } from "@/components/lista-responsive";
import { CantiereDialog } from "@/components/cantiere-dialog";
import { getChiaveMappe, geocodificaSedi } from "@/lib/cantieri.functions";
import {
  CATEGORIE_CANTIERE, CATEGORIA_LABEL, GEO_CLASS, GEO_LABEL, GEO_STATI,
  indirizzoCompleto, nomeSoggettoCantiere, testoSedeVicina,
  type CantiereRow, type GeoStato, type SedeMappa,
} from "@/lib/cantieri";

const CantieriMappa = lazy(() => import("@/components/cantieri-mappa"));

type CantieriSearch = { tab?: "lista" | "mappa"; focus?: string };

export const Route = createFileRoute("/_app/cantieri")({
  validateSearch: (s: Record<string, unknown>): CantieriSearch => ({
    tab: s["tab"] === "mappa" ? "mappa" : s["tab"] === "lista" ? "lista" : undefined,
    focus: typeof s["focus"] === "string" && s["focus"] ? s["focus"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cantieri — FidiManager" },
      { name: "description", content: "Elenco e mappa dei cantieri dei clienti e dei lead, con geocodifica automatica." },
      { property: "og:title", content: "Cantieri — FidiManager" },
      { property: "og:description", content: "Elenco e mappa dei cantieri dei clienti e dei lead, con geocodifica automatica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CantieriPage,
});

const PAGINA = 1000;

function CantieriPage() {
  const { tab, focus } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { roles } = useAuth();
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );

  const [search, setSearch] = useState("");
  const [geoF, setGeoF] = useState("tutti");
  const [agenteF, setAgenteF] = useState("tutti");
  const [attivoF, setAttivoF] = useState("tutti");
  const [categoriaF, setCategoriaF] = useState("tutte");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inModifica, setInModifica] = useState<CantiereRow | null>(null);

  const chiaveMappe = useServerFn(getChiaveMappe);
  const geoSedi = useServerFn(geocodificaSedi);
  const [sediBusy, setSediBusy] = useState(false);

  async function geocodificaLeSedi() {
    setSediBusy(true);
    try {
      const r = await geoSedi();
      if (r.ok === 0 && r.fallite === 0) toast.info("Tutte le sedi hanno già le coordinate");
      else if (r.fallite === 0) toast.success(`${r.ok} sedi geocodificate`);
      else toast.warning(`${r.ok} sedi geocodificate, ${r.fallite} fallite: ${r.messaggi.join(" — ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Geocodifica sedi non riuscita");
    } finally {
      setSediBusy(false);
    }
  }

  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Array<{ codice: string; descrizione: string | null }>;
    },
    staleTime: 300_000,
  });
  const agenteLabel = useMemo(() => {
    const m = new Map<string, string>();
    agenti.forEach((a) => m.set(a.codice, a.descrizione ?? a.codice));
    return m;
  }, [agenti]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cantieri-lista"],
    queryFn: async () => {
      const out: CantiereRow[] = [];
      for (let da = 0; ; da += PAGINA) {
        const { data, error } = await supabase
          .from("cantieri")
          .select("*, clienti(ragione_sociale, codice_agente), lead(ragione_sociale, nome, cognome), sede:stores!cantieri_sede_piu_vicina_id_fkey(nome)")
          .order("created_at", { ascending: false })
          .range(da, da + PAGINA - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as CantiereRow[];
        out.push(...batch);
        if (batch.length < PAGINA) break;
      }
      return out;
    },
  });

  const { data: mapsKey } = useQuery({
    queryKey: ["google-maps-key"],
    queryFn: async () => (await chiaveMappe()).key,
    staleTime: 3_600_000,
  });

  const filtrati = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (q) {
        const testo = [c.nome, indirizzoCompleto(c), nomeSoggettoCantiere(c)].join(" ").toLowerCase();
        if (!testo.includes(q)) return false;
      }
      const stato = (c.geocodifica_stato ?? "da_geocodificare") as GeoStato;
      if (geoF !== "tutti" && stato !== geoF) return false;
      if (agenteF !== "tutti" && (c.agente_codice ?? "") !== agenteF) return false;
      if (attivoF !== "tutti" && String(c.attivo ?? true) !== attivoF) return false;
      if (categoriaF !== "tutte" && (c.categoria ?? "") !== categoriaF) return false;
      return true;
    });
  }, [rows, search, geoF, agenteF, attivoF, categoriaF]);

  const daPosizionare = useMemo(
    () => rows.filter((c) => {
      const s = (c.geocodifica_stato ?? "da_geocodificare") as GeoStato;
      return s === "da_geocodificare" || s === "fallita" || c.lat == null || c.lng == null;
    }).length,
    [rows],
  );

  // I punti vendita sono aziendali: nessun filtro per agente/categoria.
  const { data: sedi = [] } = useQuery({
    queryKey: ["stores-mappa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome, indirizzo, cap, citta, provincia, telefono, lat, lng")
        .eq("attivo", true)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as SedeMappa[];
    },
    staleTime: 600_000,
  });

  const suMappa = useMemo(() => {
    const base = filtrati.filter((c) => c.lat != null && c.lng != null);
    // Il cantiere messo a fuoco resta visibile anche se escluso dai filtri.
    if (focus && !base.some((c) => c.id === focus)) {
      const f = rows.find((c) => c.id === focus && c.lat != null && c.lng != null);
      if (f) return [...base, f];
    }
    return base;
  }, [filtrati, rows, focus]);
  const nonMostrati = filtrati.length - filtrati.filter((c) => c.lat != null && c.lng != null).length;

  // focus=<id> senza coordinate: avviso, niente centratura.
  useEffect(() => {
    if (!focus || rows.length === 0) return;
    const c = rows.find((r) => r.id === focus);
    if (!c || c.lat == null || c.lng == null) {
      toast.error("Cantiere non posizionato: verifica l'indirizzo");
      navigate({ search: (s) => ({ ...s, focus: undefined }), replace: true });
    }
  }, [focus, rows, navigate]);

  const pulisciFocus = useCallback(() => {
    navigate({ search: (s) => ({ ...s, focus: undefined }), replace: true });
  }, [navigate]);

  const mostraSuMappa = useCallback((c: CantiereRow) => {
    if (c.lat == null || c.lng == null) {
      toast.error("Cantiere non posizionato: verifica l'indirizzo");
      return;
    }
    navigate({ search: { tab: "mappa", focus: c.id } });
  }, [navigate]);

  const apriModifica = useCallback((c: CantiereRow) => {
    setInModifica(c);
    setDialogOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="size-6 text-teal-600" /> Cantieri
          </h1>
          <p className="text-sm text-muted-foreground">Cantieri collegati a clienti e lead, con posizione su mappa.</p>
        </div>
        <div className="flex items-center gap-2">
          {isTrasversale && (
            <Button variant="outline" disabled={sediBusy} onClick={geocodificaLeSedi}>
              <MapPinned className={`size-4 mr-1.5 ${sediBusy ? "animate-pulse" : ""}`} /> Geocodifica sedi
            </Button>
          )}
          <Button onClick={() => { setInModifica(null); setDialogOpen(true); }}>
            <Plus className="size-4 mr-1.5" /> Nuovo cantiere
          </Button>
        </div>
      </div>

      {daPosizionare > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 flex items-center gap-2">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">{daPosizionare} cantieri da posizionare</span>{" "}
            <span className="text-muted-foreground">
              (senza coordinate o con geocodifica fallita): non compaiono sulla mappa.
            </span>
          </p>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setGeoF("fallita")}>
            Mostra falliti
          </Button>
        </Card>
      )}

      <Tabs
        value={tab ?? "lista"}
        onValueChange={(v) => navigate({ search: (s) => ({ ...s, tab: v as "lista" | "mappa" }) })}
      >
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="mappa">Mappa</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <Filtri
            search={search} setSearch={setSearch}
            geoF={geoF} setGeoF={setGeoF}
            agenteF={agenteF} setAgenteF={setAgenteF}
            attivoF={attivoF} setAttivoF={setAttivoF}
            categoriaF={categoriaF} setCategoriaF={setCategoriaF}
            agenti={agenti} isTrasversale={isTrasversale}
          />

          <Card className="overflow-x-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtrati.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted-foreground">Nessun cantiere trovato.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cliente / Lead</TableHead>
                    <TableHead>Indirizzo</TableHead>
                    <TableHead>Geocodifica</TableHead>
                    <TableHead>Sede più vicina</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrati.map((c) => {
                    const s = (c.geocodifica_stato ?? "da_geocodificare") as GeoStato;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.nome}
                          {c.categoria && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {CATEGORIA_LABEL[c.categoria] ?? c.categoria}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{nomeSoggettoCantiere(c)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{indirizzoCompleto(c) || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={GEO_CLASS[s]} title={c.geocodifica_messaggio ?? undefined}>
                            {s === "fallita" && <AlertTriangle className="size-3 mr-1" />}
                            {GEO_LABEL[s]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{testoSedeVicina(c) ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {c.agente_codice ? (agenteLabel.get(c.agente_codice) ?? c.agente_codice) : "—"}
                        </TableCell>
                        <TableCell>
                          {c.attivo === false
                            ? <Badge variant="outline">Chiuso</Badge>
                            : <Badge className="bg-emerald-600/15 text-emerald-700">Attivo</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost" size="icon" title="Mostra su mappa"
                              onClick={() => mostraSuMappa(c)}
                            >
                              <MapPin className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Modifica" onClick={() => apriModifica(c)}>
                              <Pencil className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="mappa" className="space-y-4">
          <Filtri
            search={search} setSearch={setSearch}
            geoF={geoF} setGeoF={setGeoF}
            agenteF={agenteF} setAgenteF={setAgenteF}
            attivoF={attivoF} setAttivoF={setAttivoF}
            categoriaF={categoriaF} setCategoriaF={setCategoriaF}
            agenti={agenti} isTrasversale={isTrasversale}
          />
          {nonMostrati > 0 && (
            <p className="text-xs text-muted-foreground">
              {nonMostrati} cantieri non mostrati perché privi di coordinate — vedi la scheda Lista.
            </p>
          )}
          <Card className="p-3">
            {!mapsKey ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Chiave Google Maps non disponibile: configura il segreto GOOGLE_MAPS_API_KEY.
              </p>
            ) : (
              <ClientOnly fallback={<Skeleton className="h-[600px] w-full" />}>
                <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                  <CantieriMappa
                    apiKey={mapsKey}
                    cantieri={suMappa}
                    sedi={sedi}
                    onApri={apriModifica}
                    focusId={focus ?? null}
                    onFocusFatto={pulisciFocus}
                  />
                </Suspense>
              </ClientOnly>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <CantiereDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setInModifica(null); }}
        cantiere={inModifica}
        agenti={agenti}
      />
    </div>
  );
}

function Filtri({
  search, setSearch, geoF, setGeoF, agenteF, setAgenteF, attivoF, setAttivoF,
  categoriaF, setCategoriaF, agenti, isTrasversale,
}: {
  search: string; setSearch: (v: string) => void;
  geoF: string; setGeoF: (v: string) => void;
  agenteF: string; setAgenteF: (v: string) => void;
  attivoF: string; setAttivoF: (v: string) => void;
  categoriaF: string; setCategoriaF: (v: string) => void;
  agenti: Array<{ codice: string; descrizione: string | null }>;
  isTrasversale: boolean;
}) {
  return (
    <FiltriCollassabili>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Cerca nome, indirizzo, cliente…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={geoF} onValueChange={setGeoF}>
          <SelectTrigger><SelectValue placeholder="Geocodifica" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutte le geocodifiche</SelectItem>
            {GEO_STATI.map((s) => <SelectItem key={s} value={s}>{GEO_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {isTrasversale && (
          <Select value={agenteF} onValueChange={setAgenteF}>
            <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli agenti</SelectItem>
              {agenti.map((a) => (
                <SelectItem key={a.codice} value={a.codice}>{a.descrizione ?? a.codice}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={attivoF} onValueChange={setAttivoF}>
          <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Attivi e chiusi</SelectItem>
            <SelectItem value="true">Solo attivi</SelectItem>
            <SelectItem value="false">Solo chiusi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoriaF} onValueChange={setCategoriaF}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le categorie</SelectItem>
            {CATEGORIE_CANTIERE.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FiltriCollassabili>
  );
}
