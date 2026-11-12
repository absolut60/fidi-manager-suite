import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Search, Send, Sparkles, Tags, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { elencoFornitori, idsFornitoriFiltrati, classificaFornitori } from "@/lib/fornitori.functions";
import { ricercaFornitori, paginaFornitore, filtroSiNo, OPZIONI_TIPO_FORNITORE, tipiFornitoreValidi, daControllareInProposta } from "@/lib/scheda-fornitore";
import { MAX_CLASSIFICA_FORNITORI } from "@/lib/fornitori";
import { puoGestireFornitori, puoVedereArticoliFornitori } from "@/lib/permessi-fornitori";
import { MAX_FORNITORI_INVIO, MAX_FORNITORI_LETTERE } from "@/lib/invio-multiplo-fornitori";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import { FiltriCollassabili } from "@/components/lista-responsive/filtri-collassabili";
import { ElencoFornitori } from "@/components/fornitori/ElencoFornitori";
import { InviaEmailMultiplaDialog } from "@/components/fornitori/InviaEmailMultiplaDialog";
import { LetteraFornitoreDialog } from "@/components/fornitori/LetteraFornitoreDialog";
import { AvanzamentoInvioFornitori } from "@/components/fornitori/AvanzamentoInvioFornitori";
import { AccessoFornitori, FiltroSiNo, ErroreFornitori, PaginazioneFornitori, useRicercaDifferita } from "@/components/fornitori/controlli-fornitori";

export const Route = createFileRoute("/_app/fornitori/")({
  validateSearch: ricercaFornitori,
  head: () => ({ meta: [{ title: "Fornitori — FidiManager" }, { name: "description", content: "Elenco fornitori MADE: anagrafiche Gamma, articoli e clienti collegati." }, { property: "og:title", content: "Fornitori — FidiManager" }, { property: "og:description", content: "Fornitori Gamma e manuali, articoli e collegamenti clienti." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaginaFornitori,
  errorComponent: ({ error }) => <p role="alert" className="p-6 text-destructive">{error instanceof Error ? error.message : "Impossibile caricare i fornitori."}</p>,
});
function PaginaFornitori() { return <AccessoFornitori><ContenutoFornitori /></AccessoFornitori>; }
function ContenutoFornitori() {
  const f = Route.useSearch();
  const navigate = Route.useNavigate();
  const { roles } = useAuth();
  const gestisce = puoGestireFornitori(roles);
  const vedeArticoli = puoVedereArticoliFornitori(roles);
  const pagina = paginaFornitore(f.pagina);
  const tipi = tipiFornitoreValidi(f.tipo, f.macro);
  const aggiornaRicerca = useCallback((q: string) => { void navigate({ search: prev => ({ ...prev, q, pagina: 1 }), replace: true, resetScroll: false }); }, [navigate]);
  const [testo, setTesto] = useRicercaDifferita(f.q, aggiornaRicerca);
  const carica = useServerFn(elencoFornitori);
  const caricaIds = useServerFn(idsFornitoriFiltrati);
  const filtriBase = { testo: f.q, ancheCliente: filtroSiNo(f.ancheCliente), conArticoli: filtroSiNo(f.conArticoli), conEmail: filtroSiNo(f.conEmail), includiManuali: f.manuali, tipi };
  const filtri = { ...filtriBase, limite: 100, offset: (pagina - 1) * 100 };
  const query = useQuery({ queryKey: ["fornitori", filtri], queryFn: () => carica({ data: filtri }) });
  const cambia = (patch: Partial<typeof f>) => void navigate({ search: prev => ({ ...prev, ...patch, pagina: 1 }), resetScroll: false });
  const attivi = [f.ancheCliente !== "tutti", f.conArticoli !== "tutti", f.conEmail !== "tutti", tipi.length > 0, f.manuali].filter(Boolean).length;

  // Selezione multipla: solo per chi gestisce i fornitori; si azzera se cambiano i filtri.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [caricoTutti, setCaricoTutti] = useState(false);
  const chiaveFiltri = JSON.stringify(filtriBase);
  useEffect(() => setSel(new Set()), [chiaveFiltri]);
  const totale = query.data?.total ?? 0;
  const selezionaTutti = async (v: boolean) => {
    if (!v) { setSel(new Set()); return; }
    setCaricoTutti(true);
    try { setSel(new Set(await caricaIds({ data: filtriBase }))); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Selezione non riuscita"); }
    finally { setCaricoTutti(false); }
  };
  const tuttiSelezionati = totale > 0 && sel.size >= totale;
  const selezione = gestisce ? {
    selezionati: sel,
    cambia: (id: string, v: boolean) => setSel(prev => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n; }),
    tutti: { tutti: tuttiSelezionati, alcuni: sel.size > 0, disabled: caricoTutti || totale === 0, onChange: (v: boolean) => void selezionaTutti(v),
      etichetta: caricoTutti ? "Seleziono…" : tuttiSelezionati ? `Tutti i ${totale.toLocaleString("it-IT")} filtrati selezionati` : `Seleziona tutti i filtrati (${totale.toLocaleString("it-IT")})` },
  } : undefined;
  const ids = useMemo(() => [...sel], [sel]);
  // FM62 F6: classificazione merci/servizi e proposta (da classificare CON articoli → Merci, tutte spuntate).
  const qc = useQueryClient();
  const classifica = useServerFn(classificaFornitori);
  const [proposta, setProposta] = useState(false);
  useEffect(() => setProposta(false), [chiaveFiltri]);
  const soloDaClassificare = tipi.length === 1 && tipi[0] === "da_classificare";
  const [lavoro, setLavoro] = useState(false);
  const avviaProposta = async () => {
    setLavoro(true);
    try {
      const conArticoli = await caricaIds({ data: { ...filtriBase, conArticoli: true } });
      setSel(new Set(conArticoli)); setProposta(true);
      toast.info(`${conArticoli.length.toLocaleString("it-IT")} fornitori con articoli proposti come Merci: togli la spunta dove non sei d'accordo.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Proposta non riuscita"); }
    finally { setLavoro(false); }
  };
  const classificaSelezionati = async (tipo: "merci" | "servizi") => {
    if (ids.length > MAX_CLASSIFICA_FORNITORI) { toast.error(`Massimo ${MAX_CLASSIFICA_FORNITORI.toLocaleString("it-IT")} fornitori per volta.`); return; }
    setLavoro(true);
    try {
      const r = await classifica({ data: { ids, tipo } });
      toast.success(`${r.aggiornati.toLocaleString("it-IT")} classificati come ${tipo === "merci" ? "Merci" : "Servizi"}${r.saltatiGamma ? ` · ${r.saltatiGamma.toLocaleString("it-IT")} saltati perché decisi in Gamma` : ""}`);
      setSel(new Set()); setProposta(false);
      await qc.invalidateQueries({ queryKey: ["fornitori"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Classificazione non riuscita"); }
    finally { setLavoro(false); }
  };
  const [emailAperta, setEmailAperta] = useState(false);
  const [lettereAperte, setLettereAperte] = useState(false);
  const [invioId, setInvioId] = useState<string | null>(null);
  const apri = (azione: "email" | "lettere") => {
    const max = azione === "email" ? MAX_FORNITORI_INVIO : MAX_FORNITORI_LETTERE;
    if (ids.length > max) { toast.error(`Massimo ${max} fornitori per ${azione === "email" ? "invio" : "stampa"}: ne hai selezionati ${ids.length.toLocaleString("it-IT")}.`); return; }
    if (azione === "email") setEmailAperta(true); else setLettereAperte(true);
  };

  return <div className={`mx-auto w-full max-w-7xl space-y-4 p-3 lg:p-6 ${sel.size ? "pb-28" : ""}`}>
    <header className="space-y-3">
      <h1 className="text-2xl font-bold text-navy">Fornitori</h1>
      <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca fornitori" className="min-h-10 pl-9" placeholder="Nome, alias, codice, P.IVA/CF, città…" value={testo} onChange={e => setTesto(e.target.value)} /></div>
      <FiltriCollassabili attivi={attivi} azioni={<Button variant="ghost" size="sm" className="min-h-9" onClick={() => cambia({ ancheCliente: "tutti", conArticoli: "tutti", conEmail: "tutti", macro: [], tipo: [], manuali: false })}>Azzera filtri</Button>}>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,11rem))_minmax(0,14rem)_minmax(0,1fr)]">
          <FiltroSiNo label="Anche cliente" value={f.ancheCliente} onChange={ancheCliente => cambia({ ancheCliente })} />
          <FiltroSiNo label="Con articoli" value={f.conArticoli} onChange={conArticoli => cambia({ conArticoli })} />
          <FiltroSiNo label="Con email" value={f.conEmail} onChange={conEmail => cambia({ conEmail })} />
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>Tipo fornitore</span><FiltroMultiplo etichetta="Tipo fornitore" testoTutti="Tutti" opzioni={OPZIONI_TIPO_FORNITORE.map(o => ({ ...o }))} selezionati={tipi} onChange={v => cambia({ tipo: v, macro: [] })} className="min-h-10 w-full text-foreground" /></div>
          <label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={f.manuali} onCheckedChange={manuali => cambia({ manuali })} />Mostra fornitori manuali</label>
        </div>
      </FiltriCollassabili>
    </header>
    {gestisce && soloDaClassificare && <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1">{proposta
        ? <>Proposta attiva: i fornitori <b>con articoli</b> sono spuntati come <b>Merci</b>. Togli la spunta dove non sei d’accordo, poi usa “Classifica come… Merci”. Le righe evidenziate non hanno articoli: guardale a mano.</>
        : <>Questi fornitori non hanno il tipo in Gamma. Con la proposta, chi ha articoli a catalogo viene suggerito come Merci.</>}</p>
      <Button variant="outline" className="min-h-10 shrink-0 gap-1.5" disabled={lavoro} onClick={() => void avviaProposta()}><Sparkles className="size-4" />{proposta ? "Rifai la proposta" : "Proposta di classificazione"}</Button>
    </div>}
    {invioId && <AvanzamentoInvioFornitori invioId={invioId} onChiudi={() => setInvioId(null)} />}
    {query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento fornitori…</p>
      : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} />
      : <><ElencoFornitori rows={query.data.rows} mostraArticoli={vedeArticoli} selezione={selezione} evidenzia={proposta ? daControllareInProposta : undefined} apri={id => void navigate({ to: "/fornitori/$id", params: { id } })} />
        <PaginazioneFornitori totale={query.data.total} pagina={pagina} dimensione={100} nome="fornitori" onChange={pagina => void navigate({ search: prev => ({ ...prev, pagina }), resetScroll: true })} /></>}
    {gestisce && sel.size > 0 && <div role="region" aria-label="Azioni sui fornitori selezionati" className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-lg border bg-background px-3 py-2.5 shadow-lg sm:bottom-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto min-w-0 text-sm font-medium tabular-nums">{sel.size.toLocaleString("it-IT")} {sel.size === 1 ? "selezionato" : "selezionati"}</span>
        <Button className="min-h-10 flex-1 gap-1.5 sm:flex-none" onClick={() => apri("email")}><Send className="size-4" />Invia email</Button>
        <Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" onClick={() => apri("lettere")}><FileText className="size-4" />Scarica lettere</Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" disabled={lavoro}><Tags className="size-4" />Classifica come…</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem className="min-h-10" onSelect={() => void classificaSelezionati("merci")}>Merci</DropdownMenuItem><DropdownMenuItem className="min-h-10" onSelect={() => void classificaSelezionati("servizi")}>Servizi</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" className="min-h-10 gap-1.5" onClick={() => setSel(new Set())}><X className="size-4" />Deseleziona</Button>
      </div>
    </div>}
    {gestisce && <InviaEmailMultiplaDialog open={emailAperta} onOpenChange={setEmailAperta} fornitoriIds={ids} onAvviato={id => { setInvioId(id); setSel(new Set()); }} />}
    {gestisce && <LetteraFornitoreDialog open={lettereAperte} onOpenChange={setLettereAperte} fornitoriIds={ids} />}
  </div>;
}
