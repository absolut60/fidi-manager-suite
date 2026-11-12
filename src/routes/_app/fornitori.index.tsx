import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, FileText, Handshake, Search, Send, Sparkles, Tag, Layers, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { elencoFornitori, idsFornitoriFiltrati, classificaFornitori, impostaStatoConvenzioneFornitori, impostaMarcaFornitori, impostaSottocategoriaFornitori } from "@/lib/fornitori.functions";
import { SceltaMarca, SceltaSottocategoria, useOpzioniFornitori } from "@/components/fornitori/MarcaSottocategoriaFornitore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ricercaFornitori, paginaFornitore, filtroSiNo, OPZIONI_TIPO_FORNITORE, tipiFornitoreValidi, daControllareInProposta, messaggioConvenzione, statiConvenzioneValidi, OPZIONI_CONVENZIONE } from "@/lib/scheda-fornitore";
import { MAX_CLASSIFICA_FORNITORI, ordinamentoFornitoriValido, VALORE_NESSUNA, type OrdinamentoFornitori } from "@/lib/fornitori";
import { puoCambiareConvenzione, puoGestireFornitori } from "@/lib/permessi-fornitori";
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
  const pagina = paginaFornitore(f.pagina);
  const tipi = tipiFornitoreValidi(f.tipo, f.macro);
  const statiConv = statiConvenzioneValidi(f.convenzione);
  const admin = puoCambiareConvenzione(roles);
  const aggiornaRicerca = useCallback((q: string) => { void navigate({ search: prev => ({ ...prev, q, pagina: 1 }), replace: true, resetScroll: false }); }, [navigate]);
  const [testo, setTesto] = useRicercaDifferita(f.q, aggiornaRicerca);
  const carica = useServerFn(elencoFornitori);
  const caricaIds = useServerFn(idsFornitoriFiltrati);
  const opzioni = useOpzioniFornitori();
  const obsoleti = admin && f.obsoleti;
  const filtriBase = { testo: f.q, ancheCliente: filtroSiNo(f.ancheCliente), conArticoli: filtroSiNo(f.conArticoli), conEmail: filtroSiNo(f.conEmail), statiConvenzione: statiConv, includiManuali: f.manuali, tipi, includiObsoleti: obsoleti, marche: f.marca, sottocategorie: f.sottocat };
  const ord = ordinamentoFornitoriValido(f.ordina, f.dir);
  const imposta = (col: OrdinamentoFornitori, dir: "asc" | "desc") => void navigate({ search: prev => ({ ...prev, ordina: col, dir, pagina: 1 }), replace: true, resetScroll: false });
  const filtri = { ...filtriBase, ordina: ord.ordina, direzione: ord.direzione, limite: 100, offset: (pagina - 1) * 100 };
  const query = useQuery({ queryKey: ["fornitori", filtri], queryFn: () => carica({ data: filtri }) });
  const cambia = (patch: Partial<typeof f>) => void navigate({ search: prev => ({ ...prev, ...patch, pagina: 1 }), replace: true, resetScroll: false });
  const attivi = [f.ancheCliente !== "tutti", f.conArticoli !== "tutti", f.conEmail !== "tutti", statiConv.length > 0, tipi.length > 0, f.manuali, f.marca.length > 0, f.sottocat.length > 0, obsoleti].filter(Boolean).length;

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
  // FM62 F7: segna/togli convenzione in blocco, con conferma.
  const convenziona = useServerFn(impostaStatoConvenzioneFornitori);
  const [confermaConv, setConfermaConv] = useState<"convenzionato" | "non_convenzionato" | null>(null);
  const impostaConvenzione = async (stato: "convenzionato" | "non_convenzionato") => {
    if (ids.length > MAX_CLASSIFICA_FORNITORI) { toast.error(`Massimo ${MAX_CLASSIFICA_FORNITORI.toLocaleString("it-IT")} fornitori per volta.`); return; }
    setLavoro(true);
    try {
      const r = await convenziona({ data: { ids, stato } });
      (r.inConflitto ? toast.warning : toast.success)(messaggioConvenzione(stato, r));
      setSel(new Set());
      await qc.invalidateQueries({ queryKey: ["fornitori"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); }
    finally { setLavoro(false); setConfermaConv(null); }
  };
  // FM62: marca e sottocategoria in blocco (solo amministratore).
  const impostaMarca = useServerFn(impostaMarcaFornitori);
  const impostaSotto = useServerFn(impostaSottocategoriaFornitori);
  const [sceltaBlocco, setSceltaBlocco] = useState<"marca" | "sottocategoria" | null>(null);
  const [valoreBlocco, setValoreBlocco] = useState<string | null>(null);
  const righe = query.data?.rows ?? [];
  // Attiva solo se tutti i selezionati sono servizi: filtro solo Servizi oppure tutti visibili in pagina e di servizi.
  const tuttiServizi = sel.size > 0 && ((tipi.length === 1 && tipi[0] === "servizi") || ids.every(id => righe.find(r => r.id === id)?.tipo_effettivo === "servizi"));
  const confermaBlocco = async () => {
    if (!sceltaBlocco) return;
    setLavoro(true);
    try {
      const r = sceltaBlocco === "marca" ? await impostaMarca({ data: { ids, marca: valoreBlocco } }) : await impostaSotto({ data: { ids, codice: valoreBlocco } });
      toast.success(`${r.aggiornati.toLocaleString("it-IT")} ${r.aggiornati === 1 ? "fornitore aggiornato" : "fornitori aggiornati"}`);
      setSel(new Set()); setSceltaBlocco(null);
      await qc.invalidateQueries({ queryKey: ["fornitori"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); }
    finally { setLavoro(false); }
  };
  const opzioniMarca = [{ valore: VALORE_NESSUNA, label: "Senza marca" }, ...(opzioni.data?.marche ?? []).map(m => ({ valore: m.codice, label: `${m.descrizione ?? m.codice} · ${m.codice}` }))];
  const opzioniSotto = [{ valore: VALORE_NESSUNA, label: "Senza sottocategoria" }, ...(opzioni.data?.sottocategorie ?? []).map(s => ({ valore: s.codice, label: s.descrizione }))];
  const [emailAperta, setEmailAperta] = useState(false);
  const [lettereAperte, setLettereAperte] = useState(false);
  const [invioId, setInvioId] = useState<string | null>(null);
  const apri = (azione: "email" | "lettere") => {
    const max = azione === "email" ? MAX_FORNITORI_INVIO : MAX_FORNITORI_LETTERE;
    if (ids.length > max) { toast.error(`Massimo ${max} fornitori per ${azione === "email" ? "invio" : "stampa"}: ne hai selezionati ${ids.length.toLocaleString("it-IT")}.`); return; }
    if (azione === "email") setEmailAperta(true); else setLettereAperte(true);
  };

  return <div className={`w-full min-w-0 space-y-4 p-3 lg:p-6 ${sel.size ? "pb-28" : ""}`}>
    <header className="space-y-3">
      <h1 className="text-2xl font-bold text-navy">Fornitori</h1>
      <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca fornitori" className="min-h-10 pl-9" placeholder="Nome, alias, codice, P.IVA/CF, città…" value={testo} onChange={e => setTesto(e.target.value)} /></div>
      <FiltriCollassabili attivi={attivi} azioni={<Button variant="ghost" size="sm" className="min-h-9" onClick={() => cambia({ ancheCliente: "tutti", conArticoli: "tutti", conEmail: "tutti", convenzione: [], macro: [], tipo: [], manuali: false, marca: [], sottocat: [], obsoleti: false })}>Azzera filtri</Button>}>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,10rem))_repeat(3,minmax(0,13rem))]">
          <FiltroSiNo label="Anche cliente" value={f.ancheCliente} onChange={ancheCliente => cambia({ ancheCliente })} />
          <FiltroSiNo label="Con articoli" value={f.conArticoli} onChange={conArticoli => cambia({ conArticoli })} />
          <FiltroSiNo label="Con email" value={f.conEmail} onChange={conEmail => cambia({ conEmail })} />
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>Convenzione</span><FiltroMultiplo etichetta="Convenzione" testoTutti="Tutti" opzioni={OPZIONI_CONVENZIONE.map(o => ({ ...o }))} selezionati={statiConv} onChange={v => cambia({ convenzione: v })} className="min-h-10 w-full text-foreground" /></div>
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>Tipo fornitore</span><FiltroMultiplo etichetta="Tipo fornitore" testoTutti="Tutti" opzioni={OPZIONI_TIPO_FORNITORE.map(o => ({ ...o }))} selezionati={tipi} onChange={v => cambia({ tipo: v, macro: [] })} className="min-h-10 w-full text-foreground" /></div>
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>Marca</span><FiltroMultiplo etichetta="Marca" testoTutti="Tutte" cercabile opzioni={opzioniMarca} selezionati={f.marca} onChange={v => cambia({ marca: v })} testoMolti={n => `${n} marche`} className="min-h-10 w-full text-foreground" /></div>
          <div className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>Sottocategoria</span><FiltroMultiplo etichetta="Sottocategoria" testoTutti="Tutte" opzioni={opzioniSotto} selezionati={f.sottocat} onChange={v => cambia({ sottocat: v })} className="min-h-10 w-full text-foreground" /></div>
          <label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={f.manuali} onCheckedChange={manuali => cambia({ manuali })} />Mostra fornitori manuali</label>
          {admin && <label className="flex min-h-10 items-center gap-2 text-sm"><Switch checked={f.obsoleti} onCheckedChange={obsoleti => cambia({ obsoleti })} />Mostra obsoleti</label>}
        </div>
      </FiltriCollassabili>
    </header>
    {gestisce && soloDaClassificare && <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1">{proposta
        ? <>Proposta attiva: i fornitori <b>con articoli</b> sono spuntati come <b>Merci</b>. Togli la spunta dove non sei d’accordo, poi conferma con “Classifica i selezionati come Merci”. Le righe evidenziate non hanno articoli: guardale a mano.</>
        : <>Questi fornitori non hanno il tipo in Gamma. Con la proposta, chi ha articoli a catalogo viene suggerito come Merci.</>}</p>
      <Button variant="outline" className="min-h-10 shrink-0 gap-1.5" disabled={lavoro} onClick={() => void avviaProposta()}><Sparkles className="size-4" />{proposta ? "Rifai la proposta" : "Proposta di classificazione"}</Button>
      {proposta && <Button className="min-h-10 shrink-0 gap-1.5" disabled={lavoro || sel.size === 0} onClick={() => void classificaSelezionati("merci")}><Check className="size-4" />Classifica i selezionati come Merci</Button>}
    </div>}
    {invioId && <AvanzamentoInvioFornitori invioId={invioId} onChiudi={() => setInvioId(null)} />}
    {query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento fornitori…</p>
      : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} />
      : <><ElencoFornitori rows={query.data.rows} ordinamento={{ ...ord, imposta }} selezione={selezione} evidenzia={proposta ? daControllareInProposta : undefined} apri={id => void navigate({ to: "/fornitori/$id", params: { id } })} />
        <PaginazioneFornitori totale={query.data.total} pagina={pagina} dimensione={100} nome="fornitori" onChange={pagina => void navigate({ search: prev => ({ ...prev, pagina }), replace: true, resetScroll: true })} /></>}
    {gestisce && sel.size > 0 && <div role="region" aria-label="Azioni sui fornitori selezionati" className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 rounded-lg border bg-background px-3 py-2.5 shadow-lg sm:bottom-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto min-w-0 text-sm font-medium tabular-nums">{sel.size.toLocaleString("it-IT")} {sel.size === 1 ? "selezionato" : "selezionati"}</span>
        <Button className="min-h-10 flex-1 gap-1.5 sm:flex-none" onClick={() => apri("email")}><Send className="size-4" />Invia email</Button>
        <Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" onClick={() => apri("lettere")}><FileText className="size-4" />Scarica lettere</Button>
        {admin && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" disabled={lavoro}><Handshake className="size-4" />Convenzione…</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem className="min-h-10" onSelect={() => setConfermaConv("convenzionato")}>Segna convenzionati</DropdownMenuItem><DropdownMenuItem className="min-h-10" onSelect={() => setConfermaConv("non_convenzionato")}>Togli convenzione</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        {admin && <Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" disabled={lavoro} onClick={() => { setValoreBlocco(null); setSceltaBlocco("marca"); }}><Tag className="size-4" />Imposta marca</Button>}
        {admin && <Button variant="outline" className="min-h-10 flex-1 gap-1.5 sm:flex-none" disabled={lavoro || !tuttiServizi} title={tuttiServizi ? undefined : "Solo se i selezionati sono tutti fornitori di servizi"} onClick={() => { setValoreBlocco(null); setSceltaBlocco("sottocategoria"); }}><Layers className="size-4" />Imposta sottocategoria</Button>}
        <Button variant="ghost" className="min-h-10 gap-1.5" onClick={() => setSel(new Set())}><X className="size-4" />Deseleziona</Button>
      </div>
    </div>}
    {gestisce && <InviaEmailMultiplaDialog open={emailAperta} onOpenChange={setEmailAperta} fornitoriIds={ids} onAvviato={id => { setInvioId(id); setSel(new Set()); }} />}
    {admin && <AlertDialog open={confermaConv !== null} onOpenChange={v => { if (!v && !lavoro) setConfermaConv(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confermaConv === "convenzionato" ? "Segnare come convenzionati?" : "Togliere la convenzione?"}</AlertDialogTitle>
          <AlertDialogDescription>{confermaConv === "convenzionato"
            ? `${ids.length.toLocaleString("it-IT")} ${ids.length === 1 ? "fornitore verrà segnato" : "fornitori verranno segnati"} come convenzionati e, dove Gamma non decide il tipo, come fornitori di Merci.`
            : `${ids.length.toLocaleString("it-IT")} ${ids.length === 1 ? "fornitore non sarà più" : "fornitori non saranno più"} convenzionati. Il tipo Merci/Servizi già impostato resta com'è.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={lavoro}>Annulla</AlertDialogCancel>
          <AlertDialogAction disabled={lavoro} onClick={e => { e.preventDefault(); if (confermaConv !== null) void impostaConvenzione(confermaConv); }}>{confermaConv === "convenzionato" ? "Segna convenzionati" : "Togli convenzione"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    {admin && <Dialog open={sceltaBlocco !== null} onOpenChange={v => { if (!v && !lavoro) setSceltaBlocco(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{sceltaBlocco === "marca" ? "Imposta marca" : "Imposta sottocategoria"}</DialogTitle>
          <DialogDescription>{`${ids.length.toLocaleString("it-IT")} ${ids.length === 1 ? "fornitore selezionato" : "fornitori selezionati"}.`}{sceltaBlocco === "marca" ? " La marca resta impostata a mano: il calcolo automatico dagli articoli non la cambierà più." : ""}</DialogDescription>
        </DialogHeader>
        {sceltaBlocco === "marca" ? <SceltaMarca valore={valoreBlocco} onChange={setValoreBlocco} disabled={lavoro} /> : <SceltaSottocategoria valore={valoreBlocco} onChange={setValoreBlocco} disabled={lavoro} />}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10" disabled={lavoro} onClick={() => setSceltaBlocco(null)}>Annulla</Button>
          <Button className="min-h-10" disabled={lavoro} onClick={() => void confermaBlocco()}>Applica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
    {gestisce && <LetteraFornitoreDialog open={lettereAperte} onOpenChange={setLettereAperte} fornitoriIds={ids} />}
  </div>;
}
