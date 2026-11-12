import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Calendar, Phone, FileText, Save, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AllegatiSection } from "@/components/allegati-section";
import { Sezione, Dato } from "@/components/articoli/SchedaArticoloGamma";
import { salvaNoteFornitore, type DettaglioFornitore } from "@/lib/fornitori.functions";
import { tabVisibiliFornitore, sottotitoloFornitore, sitoFornitore, origineLegameFornitore, type TabSchedaFornitore } from "@/lib/scheda-fornitore";
import { BadgeFornitore, BadgeTipoFornitore } from "./controlli-fornitori";
import { BandierinaConvenzionato } from "./BandierinaConvenzionato";
import { ConvenzioneCard } from "./ConvenzioneFornitore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classificaFornitori } from "@/lib/fornitori.functions";
import { tipoModificabile } from "@/lib/scheda-fornitore";
import { ArticoliFornitore } from "./ArticoliFornitore";
import { AttivitaFornitoreTab, useUltimaAttivita, dataOraIt } from "./AttivitaFornitore";
import { tipoAttivita } from "@/lib/attivita-fornitore";
import { InviaEmailFornitoreDialog } from "./InviaEmailFornitoreDialog";
import { LetteraFornitoreDialog } from "./LetteraFornitoreDialog";
import { chiaveAttivita } from "./AttivitaFornitore";
import { ContattiFornitoreTab } from "./ContattiFornitore";
import { MarcaFornitoreCampo, SottocategoriaFornitoreCampo } from "./CampiMarcaSottocategoria";
import { useContattiFornitore, personePrincipali, nomeContatto, suggerimentiContattiEmail, type ContattoFornitore } from "@/lib/contatti-fornitore";

function dataGamma(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}
export type StatoArticoliFornitore = { ricerca: string; preferenziali: boolean; pagina: number; cambiaRicerca: (value: string) => void; cambiaPreferenziali: (value: boolean) => void; cambiaPagina: (value: number) => void };
const numero = (n: number) => n.toLocaleString("it-IT", { useGrouping: true });
/** Card compatta del "colpo d'occhio", stesso stile della scheda cliente. */
function CardOcchio({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <Card className={`min-w-0 rounded-xl border-[0.5px] p-3.5 ${className ?? ""}`}><p className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</p><div className="mt-1.5 min-w-0 break-words text-sm">{children}</div></Card>;
}
export function SchedaFornitore({ fornitore: f, tab, onTabChange, statoArticoli }: { fornitore: DettaglioFornitore; tab: TabSchedaFornitore; onTabChange: (value: TabSchedaFornitore) => void; statoArticoli: StatoArticoliFornitore }) {
  const contatti = useContattiFornitore(f.id);
  const persone = contatti.data ?? [];
  const titoli: Record<TabSchedaFornitore, string> = { riepilogo: "Riepilogo", anagrafica: "Anagrafica", contatti: `Contatti (${contatti.data ? numero(persone.length) : "…"})`, articoli: `Articoli forniti (${numero(f.n_articoli)})`, clienti: "Cliente collegato", attivita: "Attività", allegati: "Allegati" };
  const tabVisibili = tabVisibiliFornitore(f.puo_vedere_articoli);
  const tabAttiva = tabVisibili.includes(tab) ? tab : "riepilogo";
  const sottotitolo = sottotitoloFornitore(f);
  const [emailAperta, setEmailAperta] = useState(false);
  const [letteraAperta, setLetteraAperta] = useState(false);
  const [allegatiEmail, setAllegatiEmail] = useState<{ file: File[]; oggetto?: string }>({ file: [] });
  const qc = useQueryClient();
  const aggiornaAttivita = () => void qc.invalidateQueries({ queryKey: chiaveAttivita(f.id) });
  return <div className="min-w-0 space-y-6">
    {f.puo_modificare_note && <InviaEmailFornitoreDialog fornitore={f} open={emailAperta} onOpenChange={v => { setEmailAperta(v); if (!v) setAllegatiEmail({ file: [] }); }}
      fileIniziali={allegatiEmail.file} oggettoIniziale={allegatiEmail.oggetto} contatti={suggerimentiContattiEmail(persone)}
      onInviata={() => { aggiornaAttivita(); onTabChange("attivita"); }} />}
    {f.puo_modificare_note && <LetteraFornitoreDialog open={letteraAperta} onOpenChange={setLetteraAperta} fornitore={f}
      onRegistrata={aggiornaAttivita}
      onAllegaEmail={(pdf, oggetto) => { setAllegatiEmail({ file: [pdf], oggetto }); setEmailAperta(true); }} />}
    {f.obsoleto && <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Fornitore obsoleto in Gamma (nome con asterischi o non valido)</p>}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{f.ragione_sociale || "Fornitore"}</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">{sottotitolo || "Codice e partita IVA non presenti"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{f.stato_convenzione === "convenzionato" && <span className="inline-flex items-center text-sm font-medium"><BandierinaConvenzionato className="-ml-1" />Convenzionato</span>}<BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} /><BadgeFornitore fornitore={f} />{f.clienti.length > 0 && <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Anche cliente</Badge>}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2" data-azioni-fornitore>
        {f.puo_modificare_note && <Button className="min-h-10 gap-1.5" onClick={() => { setAllegatiEmail({ file: [] }); setEmailAperta(true); }}><Send className="size-4" />Invia email</Button>}
        {f.puo_modificare_note && <Button variant="outline" className="min-h-10 gap-1.5" onClick={() => setLetteraAperta(true)}><FileText className="size-4" />Lettera</Button>}
      </div>
    </div>
    <Tabs value={tabAttiva} onValueChange={value => { const next = tabVisibili.find(t => t === value); if (next) onTabChange(next); }}>
      <TabsList aria-label="Sezioni della scheda fornitore" className="md:flex-wrap">{tabVisibili.map(t => <TabsTrigger key={t} value={t}>{titoli[t]}</TabsTrigger>)}</TabsList>
      <TabsContent value="riepilogo" className="max-w-7xl space-y-4"><RiepilogoFornitore fornitore={f} vaiAlTab={onTabChange} persone={persone} /></TabsContent>
      <TabsContent value="anagrafica" className="max-w-7xl space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <Sezione titolo="Anagrafica" icon={Building2}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="Ragione sociale" value={f.ragione_sociale} /><Dato label="P.IVA" value={f.partita_iva} /><Dato label="Codice fiscale" value={f.codice_fiscale} /><Dato label="Indirizzo" value={[f.indirizzo, [f.cap, f.citta, f.provincia ? `(${f.provincia})` : null].filter(Boolean).join(" ")].filter(Boolean).join(", ")} /><Dato label="Stato" value={f.stato} /></dl></Sezione>
          <Sezione titolo="Contatti Gamma" icon={Phone}><ContattiFornitore fornitore={f} /></Sezione>
          <Sezione titolo="Gamma" icon={Calendar}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="Codice fornitore" value={f.codice_gestionale} /><Dato label="Macrocategoria Gamma" value={f.macrocategoria_cod ? `${f.macrocategoria_desc ?? "—"} (${f.macrocategoria_cod})` : "Non indicata"} /><Dato label="Anagrafica generale" value={f.codice_anagrafica_generale} /><Dato label="Codice cliente Gamma" value={f.codice_cliente_gamma} /><Dato label="Condizione di pagamento" value={f.condizione_pagamento_desc ? `${f.condizione_pagamento_desc}${f.condizione_pagamento_cod ? ` (${f.condizione_pagamento_cod})` : ""}` : f.condizione_pagamento_cod} /><Dato label="Ultima modifica Gamma" value={dataGamma(f.ultima_modifica_gamma)} /><Dato label="Ultima sincronizzazione" value={dataGamma(f.ultima_sincronizzazione)} /></dl></Sezione>
        </div>
        <p className="text-xs text-muted-foreground">I dati anagrafici arrivano da Gamma e si aggiornano con l’import.</p>
      </TabsContent>
      <TabsContent value="contatti" className="max-w-7xl"><ContattiFornitoreTab fornitore={f} puoGestire={f.puo_modificare_note} /></TabsContent>
      {f.puo_vedere_articoli && <TabsContent value="articoli"><ArticoliFornitore id={f.id} {...statoArticoli} /></TabsContent>}
      <TabsContent value="clienti" className="max-w-7xl"><ClientiFornitore clienti={f.clienti} /></TabsContent>
      <TabsContent value="attivita" className="max-w-5xl"><AttivitaFornitoreTab fornitoreId={f.id} puoScrivere={f.puo_modificare_note} contatti={persone} /></TabsContent>
      <TabsContent value="allegati" className="max-w-7xl"><Card className="p-3 sm:p-4"><AllegatiSection entitaTipo="fornitore" entitaId={f.id} clienteId={null} canEdit={f.puo_modificare_note} eliminaTutti={f.puo_modificare_note} /></Card></TabsContent>
    </Tabs>
  </div>;
}
function RiepilogoFornitore({ fornitore: f, vaiAlTab, persone }: { fornitore: DettaglioFornitore; vaiAlTab: (t: TabSchedaFornitore) => void; persone: ContattoFornitore[] }) {
  const link = "inline-flex min-h-8 items-center break-all text-primary hover:underline";
  const principali = [{ l: "Tel.", v: f.telefono || f.cellulare, p: "tel:" }, { l: "Email", v: f.email, p: "mailto:" }, { l: "PEC", v: f.pec, p: "mailto:" }].filter(c => c.v?.trim());
  return <>
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Colpo d'occhio</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CardOcchio label="Tipo fornitore"><TipoFornitoreModifica fornitore={f} /></CardOcchio>
        <CardOcchio label="Marca"><MarcaFornitoreCampo fornitore={f} /></CardOcchio>
        {f.tipo_effettivo === "servizi" && <CardOcchio label="Sottocategoria"><SottocategoriaFornitoreCampo fornitore={f} /></CardOcchio>}
        <CardOcchio label="Condizione di pagamento fornitore"><span className="font-semibold">{f.condizione_pagamento_desc || f.condizione_pagamento_cod || "—"}</span>{f.condizione_pagamento_desc && f.condizione_pagamento_cod && <span className="ml-1 text-xs text-muted-foreground">({f.condizione_pagamento_cod})</span>}</CardOcchio>
        {f.puo_vedere_articoli && <CardOcchio label="Articoli forniti"><button type="button" onClick={() => vaiAlTab("articoli")} className="text-left font-semibold tabular-nums text-primary hover:underline">{numero(f.n_articoli)}</button><span className="block text-xs text-muted-foreground tabular-nums">di cui {numero(f.n_preferenziale)} preferenziale</span></CardOcchio>}
        <CardOcchio label="È anche cliente">{f.clienti.length ? <span className="flex flex-col gap-0.5">{f.clienti.map(c => <Link key={c.cliente_id} to="/clienti/$clienteId" params={{ clienteId: c.cliente_id }} className="font-semibold text-success hover:underline">Sì{c.codice_gestionale ? ` — cod. ${c.codice_gestionale}` : ""}</Link>)}</span> : <span className="font-semibold text-muted-foreground">No</span>}</CardOcchio>
      </div>
    </section>
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
      <Sezione titolo="Contatti principali" icon={Phone}>{principali.length ? <dl className="space-y-1">{principali.map(c => <div key={c.l} className="flex min-w-0 items-baseline gap-2"><dt className="w-12 shrink-0 text-xs font-medium uppercase text-muted-foreground">{c.l}</dt><dd className="min-w-0"><a className={link} href={`${c.p}${c.v!.trim()}`}>{c.v}</a></dd></div>)}</dl> : <p className="text-sm text-muted-foreground">Nessun contatto in Gamma</p>}
        <PersoneRiepilogo persone={persone} vai={() => vaiAlTab("contatti")} /></Sezione>
      <Sezione titolo="Note interne" icon={FileText}><NoteFornitore fornitore={f} /></Sezione>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"><ConvenzioneCard fornitore={f} /><UltimaAttivitaCard fornitoreId={f.id} vai={() => vaiAlTab("attivita")} /></div>
  </>;
}
/** Merci/Servizi: modificabile solo se non decide Gamma e solo da chi gestisce i fornitori. */
function TipoFornitoreModifica({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const qc = useQueryClient();
  const classifica = useServerFn(classificaFornitori);
  const m = useMutation({
    mutationFn: (tipo: "merci" | "servizi") => classifica({ data: { ids: [f.id], tipo } }),
    onSuccess: async () => { toast.success("Tipo fornitore salvato"); await qc.invalidateQueries({ queryKey: ["fornitore", f.id] }); void qc.invalidateQueries({ queryKey: ["fornitori"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!tipoModificabile(f.tipo_fonte)) return <div className="space-y-1"><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} /><p className="text-xs text-muted-foreground">{f.tipo_fonte === "convenzionato" ? "Merci perché convenzionato" : "Deciso in Gamma"}</p></div>;
  if (!f.puo_modificare_note) return <BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />;
  return <Select value={f.tipo_effettivo === "da_classificare" ? "" : f.tipo_effettivo} disabled={m.isPending} onValueChange={v => m.mutate(v as "merci" | "servizi")}>
    <SelectTrigger aria-label="Tipo fornitore" className={`min-h-10 w-full ${f.tipo_effettivo === "da_classificare" ? "border-warning/50 text-muted-foreground" : ""}`}><SelectValue placeholder="Da classificare" /></SelectTrigger>
    <SelectContent><SelectItem value="merci">Merci</SelectItem><SelectItem value="servizi">Servizi</SelectItem></SelectContent>
  </Select>;
}
/** Fino a 3 referenti (principali prima) sotto telefono/email Gamma. */
function PersoneRiepilogo({ persone, vai }: { persone: ContattoFornitore[]; vai: () => void }) {
  const link = "break-all text-primary hover:underline";
  const lista = personePrincipali(persone, 3);
  return <div className="mt-3 border-t pt-3">
    <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Persone</p>
    {!lista.length ? <button type="button" onClick={vai} className="min-h-8 text-left text-sm text-muted-foreground hover:underline">Nessun referente — aggiungine uno</button>
      : <ul className="space-y-2">{lista.map(c => { const tel = c.cellulare || c.telefono; return <li key={c.id} className="min-w-0 text-sm">
        <p className="break-words font-medium">{nomeContatto(c)}{c.ruolo && <span className="font-normal text-muted-foreground"> · {c.ruolo}</span>}</p>
        <p className="flex min-w-0 flex-wrap gap-x-3 text-xs">{tel && <a className={link} href={`tel:${tel}`}>{tel}</a>}{c.email && <a className={link} href={`mailto:${c.email}`}>{c.email}</a>}</p>
      </li>; })}</ul>}
    {persone.length > 3 && <button type="button" onClick={vai} className="mt-1 min-h-8 text-sm text-primary hover:underline">Tutti i contatti ({persone.length.toLocaleString("it-IT")})</button>}
  </div>;
}
function ContattiFornitore({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const contatti = [{ label: "Telefono", value: f.telefono, prefisso: "tel:" }, { label: "Telefono 2", value: f.telefono_2, prefisso: "tel:" }, { label: "Cellulare", value: f.cellulare, prefisso: "tel:" }, { label: "Fax", value: f.fax, prefisso: null }, { label: "Email", value: f.email, prefisso: "mailto:" }, { label: "PEC", value: f.pec, prefisso: "mailto:" }].filter(c => c.value?.trim());
  const sito = sitoFornitore(f.sito);
  if (!contatti.length && !sito) return <p className="text-sm text-muted-foreground">Nessun contatto in Gamma</p>;
  return <dl>{contatti.map(c => <Dato key={c.label} label={c.label} value={c.prefisso ? <a className="inline-flex min-h-10 items-center break-all text-primary underline underline-offset-4" href={`${c.prefisso}${c.value?.trim()}`}>{c.value}</a> : c.value} />)}{sito && <Dato label="Sito" value={<a href={sito} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center break-all text-primary underline underline-offset-4">{f.sito}</a>} />}</dl>;
}
function NoteFornitore({ fornitore: f }: { fornitore: DettaglioFornitore }) {
  const [note, setNote] = useState(f.note ?? "");
  useEffect(() => setNote(f.note ?? ""), [f.id, f.note]);
  const salva = useServerFn(salvaNoteFornitore);
  const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: () => salva({ data: { id: f.id, note } }), onSuccess: async () => { toast.success("Note interne salvate"); await qc.invalidateQueries({ queryKey: ["fornitore", f.id] }); }, onError: error => toast.error(error.message) });
  if (!f.puo_modificare_note) return <p className="whitespace-pre-wrap break-words text-sm">{f.note || "Nessuna nota"}</p>;
  const n = Array.from(note).length;
  return <form onSubmit={e => { e.preventDefault(); if (n <= 4000 && !mutation.isPending) mutation.mutate(); }} className="space-y-2"><Textarea aria-label="Note interne" rows={5} value={note} disabled={mutation.isPending} onChange={e => { if (Array.from(e.target.value).length <= 4000) setNote(e.target.value); }} /><p className="text-right text-xs text-muted-foreground tabular-nums">{n.toLocaleString("it-IT", { useGrouping: true })}/4000</p><Button type="submit" disabled={mutation.isPending || note === (f.note ?? "")} className="min-h-10 w-full sm:w-auto"><Save className="mr-2 size-4" />{mutation.isPending ? "Salvataggio…" : "Salva note"}</Button>{mutation.error && <p role="alert" className="break-words text-sm text-destructive">{mutation.error.message}</p>}</form>;
}
export function ClientiFornitore({ clienti }: { clienti: DettaglioFornitore["clienti"] }) {
  if (!clienti.length) return <p className="py-6 text-muted-foreground">Questo fornitore non risulta cliente</p>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{clienti.map(c => <Sezione key={c.cliente_id} titolo={c.ragione_sociale || "Cliente"} icon={Users}><dl><Dato label="Codice cliente" value={c.codice_gestionale} /><Dato label="Negozio" value={c.store_nome} /></dl><div className="mt-3 flex flex-wrap gap-2">{c.bloccato && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Bloccato</Badge>}{c.in_gestione_legale && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">In gestione legale</Badge>}</div><p className="mt-3 break-words text-sm text-muted-foreground">{origineLegameFornitore(c.origine_legame, c.coincide_su)}</p><Button variant="outline" className="mt-3 min-h-10" asChild><Link to="/clienti/$clienteId" params={{ clienteId: c.cliente_id }}>Apri scheda cliente</Link></Button></Sezione>)}</div>;
}
function UltimaAttivitaCard({ fornitoreId, vai }: { fornitoreId: string; vai: () => void }) {
  const q = useUltimaAttivita(fornitoreId);
  const a = q.data?.pages[0]?.rows[0];
  return <CardOcchio label="Ultima attività">{q.isPending ? <span className="text-muted-foreground">…</span> : !a ? <button type="button" onClick={vai} className="text-left text-muted-foreground hover:underline">Nessuna</button> : <button type="button" onClick={vai} className="block min-w-0 text-left hover:underline"><span className="font-semibold text-primary">{tipoAttivita(a.tipo).label}</span><span className="block text-xs tabular-nums text-muted-foreground">{dataOraIt(a.data_attivita)}</span>{a.oggetto && <span className="block line-clamp-2 break-words text-xs">{a.oggetto}</span>}</button>}</CardOcchio>;
}
