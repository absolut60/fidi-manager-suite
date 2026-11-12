import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Save, ChevronDown, Package, Tag, Truck, Barcode, Calendar, ArrowRight, Layers, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberInputIt } from "@/components/ui/number-input-it";
import { updateArticolo } from "@/lib/articoli-api";
import { dettaglioArticoloGamma, disponibilitaSchedaArticolo } from "@/lib/catalogo-articoli.functions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { prezzoArticolo } from "@/lib/catalogo-articoli";
import { ORDINE_LISTINI_ARTICOLO, numeroAcquistoArticolo, patchTecniciArticolo, totaleDisponibilitaArticolo, margineArticolo, TAB_SCHEDA_ARTICOLO, type TabSchedaArticolo, type RigaDisponibilitaArticolo, type TecniciArticolo } from "@/lib/scheda-articolo";

export type DettaglioGamma = NonNullable<Awaited<ReturnType<typeof dettaglioArticoloGamma>>>;
const LABEL_TAB = { panoramica: "Panoramica", vendita: "Vendita", acquisto: "Acquisto", disponibilita: "Disponibilità", fornitori: "Fornitori", "sistema-made": "Sistema MADE" };
const NOMI_LISTINI = { 10: "Lombardia", 20: "Piemonte", 30: "Applicatori", 9: "Transitorio Saviedil" };
function Sezione({ titolo, children, icon: Icon = Package }: { titolo: string; children: ReactNode; icon?: LucideIcon }) {
  return <Card className="min-w-0 border-l-[3px] border-l-primary p-3 sm:p-4" role="region" aria-label={titolo}><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Icon className="size-4 shrink-0" />{titolo}</h2>{children}</Card>;
}
function Dato({ label, value }: { label: string; value: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2 border-b py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words tabular-nums">{value ?? "—"}</dd></div>;
}
function dataGamma(value: string | null, ora = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", ...(ora ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" } : {}) });
}
function percentuale(value: number | null) { return value == null ? "—" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`; }
function Indicatore({ label, value, sotto, tono = "primary", testo = false }: { label: string; value: ReactNode; sotto?: string; tono?: "primary" | "success" | "warning" | "destructive"; testo?: boolean }) {
  const colori = { primary: "border-l-primary bg-primary/5", success: "border-l-success bg-success/10", warning: "border-l-warning bg-warning/10", destructive: "border-l-destructive bg-destructive/10" };
  return <div className={`min-w-0 rounded-md border border-l-4 p-3 ${colori[tono]}`}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-1 break-words font-semibold tabular-nums ${testo ? "text-base" : "text-xl sm:text-2xl"}`}>{value}</p>{sotto && <p className="mt-1 text-xs text-muted-foreground">{sotto}</p>}</div>;
}

export function SchedaArticoloGamma({ articolo: a, tab = "panoramica", onTabChange }: { articolo: DettaglioGamma; tab?: TabSchedaArticolo; onTabChange?: (tab: TabSchedaArticolo) => void }) {
  const [locale, setLocale] = useState<TabSchedaArticolo>(tab);
  const attiva = onTabChange ? tab : locale;
  const cambiaTab = (value: TabSchedaArticolo) => { setLocale(value); onTabChange?.(value); };
  const query = useQuery({ queryKey: ["catalogo-articolo-disponibilita", a.codice], queryFn: () => disponibilitaSchedaArticolo({ data: { codice: a.codice } }) });
  const rows = query.data ?? [];
  const totale = query.data ? totaleDisponibilitaArticolo(rows) : null;
  const listini = ORDINE_LISTINI_ARTICOLO.map((codice) => ({ codice, descrizione: NOMI_LISTINI[codice], prezzo: a.prezzi.find((l) => l.listino === codice) }));
  const vendita10 = listini[0].prezzo?.prezzo_vendita;
  const margine = margineArticolo(vendita10, a.costo_ultimo);
  const statoClass = !a.attivo ? "bg-destructive/15 text-destructive border-destructive/30" : a.stato_gamma === "in_esaurimento" ? "bg-warning/15 text-warning border-warning/30" : "bg-success/15 text-success border-success/30";
  const disponibilita = query.isPending ? <p role="status" className="text-sm text-muted-foreground">Caricamento disponibilità…</p> : query.error ? <div role="alert" className="text-sm text-destructive"><p>Disponibilità non disponibile: {query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()} className="mt-2 min-h-10">Riprova</Button></div> : <DisponibilitaArticoloVista rows={rows} />;
  return <div className="mt-3 min-w-0 space-y-4">
    <Card className="border-t-4 border-t-primary p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="mb-2 text-sm font-semibold text-primary">Scheda articolo</p><span className="break-all font-mono text-sm text-muted-foreground">{a.codice}</span><h1 className="mt-1 break-words text-2xl font-bold sm:text-3xl">{a.descrizione ?? "—"}</h1><p className="mt-2 break-words text-sm text-muted-foreground">{a.marche?.descrizione ?? "—"}<span className="mx-2">·</span>{[a.famiglia, a.sottofamiglia].filter(Boolean).join(" › ")}</p></div><Badge variant="outline" className={`shrink-0 ${statoClass}`}>{!a.attivo ? "Dismesso in Gamma" : a.stato_gamma === "in_esaurimento" ? "In esaurimento" : "In uso"}</Badge></div>
      {a.descrizione_estesa && a.descrizione_estesa.trim() !== a.descrizione?.trim() && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.descrizione_estesa}</p>}
      {!a.attivo && <p role="alert" className="mt-3 border-l-4 border-destructive bg-destructive/10 p-3 text-sm text-destructive">Articolo dismesso in Gamma: non è più vendibile.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5"><Indicatore label="Disponibilità totale" value={totale == null ? "—" : totale.toLocaleString("it-IT", { maximumFractionDigits: 6 })} sotto={query.isPending ? "Caricamento…" : query.error ? "Non disponibile" : "sedi + logistica comune"} tono={totale == null ? "primary" : totale > 0 ? "success" : "destructive"} /><Indicatore label="Vendita · L10 Lombardia" value={prezzoArticolo(vendita10 ?? null)} /><Indicatore label="Costo ultimo" value={numeroAcquistoArticolo(a.costo_ultimo, true)} sotto="base per il margine" tono="warning" /><Indicatore label="Margine · L10" value={percentuale(margine)} sotto="su costo ultimo" tono={margine == null ? "primary" : margine > 0 ? "success" : "destructive"} /><div className="col-span-2 min-w-0 lg:col-span-1"><Indicatore label="Fornitore preferenziale" value={a.fornitore?.ragione_sociale ?? "—"} testo /></div></div></div>
    </Card>
    <Tabs value={attiva} onValueChange={(value) => { const next = TAB_SCHEDA_ARTICOLO.find((t) => t === value); if (next) cambiaTab(next); }}>
      <TabsList className="max-w-full md:justify-start" aria-label="Sezioni della scheda articolo">{TAB_SCHEDA_ARTICOLO.map((t) => <TabsTrigger className="min-h-10" key={t} value={t}>{LABEL_TAB[t]}</TabsTrigger>)}</TabsList>
      <TabsContent value="panoramica" className="mt-4"><div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-3"><Sezione titolo="Identificazione" icon={Barcode}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="Codice a barre" value={a.codice_a_barre} /><Dato label="Codice art. fornitore" value={a.codice_articolo_fornitore} /><Dato label="U.M." value={a.um} /><Dato label="U.M. 2" value={a.um2} /><Dato label="Conversione" value={a.fattore_conversione?.toLocaleString("it-IT")} /><Dato label="IVA" value={a.iva} /><Dato label="Peso netto" value={a.peso_netto?.toLocaleString("it-IT")} /></dl></Sezione><Sezione titolo="Gamma" icon={Calendar}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="Creato" value={dataGamma(a.data_creazione_gamma)} /><Dato label="Aggiornato" value={dataGamma(a.data_aggiornamento_gamma)} /><Dato label="Sincronizzato" value={dataGamma(a.ultima_sincronizzazione, true)} /><Dato label="Premio fornitore" value={a.premio_fornitore} /><Dato label="N. fornitori" value={a.n_fornitori?.toLocaleString("it-IT")} /></dl></Sezione></div><Sezione titolo="Disponibilità per sede"><RiepilogoDisponibilita rows={rows} />{query.isPending && <p className="text-sm text-muted-foreground">Caricamento…</p>}{query.error && <p className="text-sm text-destructive">Disponibilità non disponibile.</p>}<Button variant="ghost" className="mt-3 min-h-10 w-full justify-between text-primary" onClick={() => cambiaTab("disponibilita")}>Vedi tutto<ArrowRight className="size-4" /></Button></Sezione></div></TabsContent>
      <TabsContent value="vendita" className="mt-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{listini.map((l) => { const prezzo = l.prezzo?.prezzo_vendita; const m = margineArticolo(prezzo, a.costo_ultimo); return <Card key={l.codice} className={`min-w-0 border-l-4 p-4 sm:p-5 ${prezzo == null ? "border-l-border bg-muted/40" : "border-l-primary"}`}><div className="flex items-center gap-2"><Tag className="size-4 text-primary" /><h2 className="break-words text-base font-semibold">{l.codice} · {l.descrizione}</h2></div><p className={`mt-4 break-words text-3xl font-bold tabular-nums ${prezzo == null ? "text-muted-foreground" : "text-primary"}`}>{prezzo == null ? "Non a listino" : prezzoArticolo(prezzo)}</p><div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"><span className="text-muted-foreground">Margine su costo ultimo</span><span className={`font-semibold tabular-nums ${m == null ? "text-muted-foreground" : m > 0 ? "text-success" : "text-destructive"}`}>{percentuale(m)}</span></div></Card>; })}</div></TabsContent>
      <TabsContent value="acquisto" className="mt-4 space-y-3"><Sezione titolo="Listino d’acquisto" icon={Truck}><div className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Listini d’acquisto, tabella scorrevole"><table className="w-full min-w-[720px] table-fixed text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th scope="col" className="w-[20%] py-3 pr-2 font-medium">Listino</th>{["Prezzo fornitore", "Sc1 %", "Sc2 %", "Sc3 %", "Trasporto %", "Trasporto €", "Netto"].map((t) => <th scope="col" key={t} className="px-1 py-3 text-right font-medium">{t}</th>)}</tr></thead><tbody>{listini.map((l) => <tr key={l.codice} className="border-b"><th scope="row" className="break-words py-4 pr-2 text-left font-medium">{l.codice} · {l.descrizione}</th>{[l.prezzo?.acq_prezzo, l.prezzo?.acq_sc1, l.prezzo?.acq_sc2, l.prezzo?.acq_sc3, l.prezzo?.acq_trasporto_perc, l.prezzo?.acq_trasporto_euro, l.prezzo?.costo_acquisto].map((v, i) => <td key={i} className={`px-1 py-4 text-right tabular-nums ${i === 6 ? "bg-primary/5 font-semibold text-primary" : ""}`}>{numeroAcquistoArticolo(v)}</td>)}</tr>)}</tbody></table></div></Sezione><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Indicatore label="Costo ultimo" value={numeroAcquistoArticolo(a.costo_ultimo, true)} sotto="usato per il margine nei preventivi" tono="warning" /><Indicatore label="Costo medio" value={numeroAcquistoArticolo(a.costo_medio, true)} /><Indicatore label="Costo FIFO" value={numeroAcquistoArticolo(a.costo_fifo, true)} /></div></TabsContent>
      <TabsContent value="disponibilita" className="mt-4"><Sezione titolo="Disponibilità">{disponibilita}</Sezione></TabsContent>
      <TabsContent value="fornitori" className="mt-4"><section aria-label="Fornitori"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Truck className="size-4" />Fornitori</h2><FornitoriArticolo rows={a.fornitori} /></section></TabsContent>
      <TabsContent value="sistema-made" className="mt-4"><div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><Sezione titolo="Dati tecnici — Sistema MADE" icon={Layers}>{a.tecnico ? <FormTecnici key={a.tecnico.id} tecnico={a.tecnico} codice={a.codice} modificabile={a.puoModificareTecnici} /> : <p className="text-sm text-muted-foreground">Nessun dato tecnico Sistema MADE per questo articolo.</p>}</Sezione>{a.tecnico && a.utilizzo && <Sezione titolo="Nel preventivatore" icon={Layers}><UtilizzoArticolo utilizzo={a.utilizzo} /></Sezione>}</div></TabsContent>
    </Tabs>
  </div>;
}
function RiepilogoDisponibilita({ rows }: { rows: RigaDisponibilitaArticolo[] }) {
  const sedi = rows.filter((r) => r.livello === "sede").sort((a, b) => (b.disponibilita ?? 0) - (a.disponibilita ?? 0)).slice(0, 5);
  const max = Math.max(1, ...sedi.map((r) => Math.abs(r.disponibilita ?? 0)));
  return <div className="space-y-3">{sedi.map((r, i) => <div key={r.store_id || i}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{r.nome}</span><span className={`shrink-0 font-semibold tabular-nums ${(r.disponibilita ?? 0) > 0 ? "text-success" : "text-destructive"}`}>{r.disponibilita?.toLocaleString("it-IT")}</span></div><BarraDisponibilita value={r.disponibilita ?? 0} max={max} /></div>)}{!sedi.length && rows.length > 0 && <p className="text-sm text-muted-foreground">Nessuna giacenza nelle sedi.</p>}</div>;
}
function BarraDisponibilita({ value, max, escluso = false }: { value: number; max: number; escluso?: boolean }) {
  return <Progress aria-label="Disponibilità relativa" value={Math.abs(value) / max * 100} className={`mt-1 h-1.5 bg-muted ${escluso ? "[&>div]:bg-muted-foreground" : value > 0 ? "[&>div]:bg-success" : "[&>div]:bg-destructive"}`} />;
}

export function DisponibilitaArticoloVista({ rows }: { rows: RigaDisponibilitaArticolo[] }) {
  const [aperto, setAperto] = useState(false);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nessuna giacenza nei depositi</p>;
  const sedi = rows.filter((r) => r.livello === "sede").sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "it-IT"));
  const logistica = rows.filter((r) => r.livello === "logistica_comune");
  const depositi = rows.filter((r) => r.livello === "deposito").sort((a, b) => (a.deposito_codice ?? "").localeCompare(b.deposito_codice ?? "", "it-IT"));
  return <div className="space-y-4"><TabellaDisponibilita rows={sedi} />
    {logistica.length > 0 && <div className="border-l-4 border-primary bg-muted/50 p-3"><h3 className="mb-2 text-sm font-semibold">Logistica comune</h3><TabellaDisponibilita rows={logistica} /></div>}
    <Indicatore label="Totale disponibilità" value={totaleDisponibilitaArticolo(rows).toLocaleString("it-IT", { maximumFractionDigits: 6 })} sotto="sedi + logistica comune" tono={totaleDisponibilitaArticolo(rows) > 0 ? "success" : "destructive"} />
    {depositi.length > 0 && <Collapsible open={aperto} onOpenChange={setAperto}><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 w-full justify-between">Dettaglio per deposito<ChevronDown className={`size-4 ${aperto ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger><CollapsibleContent className="pt-3"><TabellaDisponibilita rows={depositi} depositi /></CollapsibleContent></Collapsible>}
  </div>;
}
function TabellaDisponibilita({ rows, depositi = false }: { rows: RigaDisponibilitaArticolo[]; depositi?: boolean }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.disponibilita ?? 0)));
  return <div className="max-w-full overflow-x-auto" tabIndex={0} aria-label={depositi ? "Disponibilità per deposito" : "Disponibilità per sede"}><table className="w-full min-w-[560px] table-fixed text-sm"><thead><tr className="border-b text-muted-foreground"><th scope="col" className="w-[32%] py-2 pr-2 text-left font-medium">{depositi ? "Deposito" : "Sede"}</th>{["Giacenza", "Impegnato clienti", "Ordinato fornitori", "Disponibilità"].map((label) => <th scope="col" key={label} className="px-1 py-2 text-right font-medium">{label}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.livello}-${r.deposito_codice ?? r.store_id ?? i}`} className={`border-b ${depositi && r.conta_disponibilita === "no" ? "text-muted-foreground" : ""}`}><th scope="row" className="break-words py-3 pr-2 text-left font-normal">{depositi ? `${r.deposito_codice} · ${r.nome ?? "—"}` : r.nome ?? "—"}{depositi && r.conta_disponibilita === "no" && <span className="mt-1 block text-xs">non conteggiato</span>}{depositi && r.conta_disponibilita === "logistica_comune" && <span className="mt-1 block text-xs">Logistica comune</span>}</th>{[r.giacenza, r.impegnato_clienti, r.ordinato_fornitori, r.disponibilita].map((v, index) => <td key={index} className={`px-1 py-3 text-right font-mono tabular-nums ${index === 3 ? "font-semibold" : ""}`}>{v == null ? "—" : <span className={index === 3 && !(depositi && r.conta_disponibilita === "no") ? v > 0 ? "text-success" : "text-destructive" : ""}>{v.toLocaleString("it-IT", { maximumFractionDigits: 6 })}</span>}{index === 3 && <BarraDisponibilita value={v ?? 0} max={max} escluso={depositi && r.conta_disponibilita === "no"} />}</td>)}</tr>)}</tbody></table></div>;
}
export function FornitoriArticolo({ rows }: { rows: DettaglioGamma["fornitori"] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nessun fornitore associato.</p>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.map((r) => <Card key={`${r.fornitore_codice}-${r.codice_articolo_fornitore}`} className={`min-w-0 p-3 sm:p-4 ${r.preferenziale ? "border-l-4 border-l-success" : ""}`}><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{r.fornitore?.ragione_sociale ?? "—"}</h3>{r.preferenziale && <Badge variant="outline" className="bg-success/15 text-success border-success/30">Preferenziale</Badge>}</div><dl className="mt-3"><Dato label="Codice Gamma" value={r.fornitore_codice} /><Dato label="Codice art. fornitore" value={r.codice_articolo_fornitore || "—"} /></dl></Card>)}</div>;
}
export function UtilizzoArticolo({ utilizzo }: { utilizzo: NonNullable<DettaglioGamma["utilizzo"]> }) {
  return <><dl><Dato label="Preventivi" value={utilizzo.preventivi.toLocaleString("it-IT")} /></dl><h3 className="mt-3 text-sm font-semibold">Kit</h3>{!utilizzo.kit.length ? <p className="mt-2 text-sm text-muted-foreground">Nessun kit usa questo articolo.</p> : <ul className="mt-2 divide-y">{utilizzo.kit.map((r) => <li key={r.id} className="py-2 text-sm">{r.kit ? <Link to="/kit/$id" params={{ id: r.kit.id }} className="block min-h-10 break-words text-primary underline underline-offset-4">{r.kit.nome}</Link> : <span>—</span>}<span className="block break-words text-muted-foreground">{r.ruolo ?? "—"}</span></li>)}</ul>}</>;
}

function FormTecnici({ tecnico, codice, modificabile }: { tecnico: NonNullable<DettaglioGamma["tecnico"]>; codice: string; modificabile: boolean }) {
  const [form, setForm] = useState<TecniciArticolo>(() => patchTecniciArticolo(tecnico));
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: () => updateArticolo(tecnico.id, patchTecniciArticolo(form)), onSuccess: async () => {
    toast.success("Dati tecnici salvati");
    await Promise.all([qc.invalidateQueries({ queryKey: ["catalogo-articolo", codice] }), qc.invalidateQueries({ queryKey: ["articolo", tecnico.id] }), qc.invalidateQueries({ queryKey: ["articoli"] })]);
  }, onError: (e) => toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito") });
  const testi = [{ campo: "categoria", label: "Categoria" }, { campo: "tipologia", label: "Tipologia" }, { campo: "componente", label: "Componente" }] as const;
  const numeri = [{ campo: "qta_cliente", label: "Q.tà cliente" }, { campo: "qta_fornitore", label: "Q.tà fornitore" }, { campo: "peso_unit", label: "Peso unitario" }] as const;
  const note = [{ campo: "note_acquisto", label: "Note acquisto" }, { campo: "note", label: "Note" }] as const;
  if (!modificabile) return <dl>{testi.map(({ campo, label }) => <Dato key={campo} label={label} value={form[campo]} />)}{numeri.map(({ campo, label }) => <Dato key={campo} label={label} value={form[campo]?.toLocaleString("it-IT")} />)}{note.map(({ campo, label }) => <Dato key={campo} label={label} value={<span className="whitespace-pre-wrap">{form[campo] || "—"}</span>} />)}</dl>;
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}><fieldset disabled={save.isPending} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {testi.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><Input className="min-h-11" value={form[campo] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value || null }))} /></label>)}
    {numeri.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><NumberInputIt className="min-h-11" value={form[campo] ?? null} onChange={(value) => setForm((f) => ({ ...f, [campo]: value }))} /></label>)}
    {note.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><Textarea rows={3} value={form[campo] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value || null }))} /></label>)}
    <Button type="submit" className="min-h-11 w-full sm:col-span-2" disabled={save.isPending}><Save className="mr-2 size-4" />{save.isPending ? "Salvataggio…" : "Salva dati tecnici"}</Button>
  </fieldset></form>;
}