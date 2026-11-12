import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Calendar, Phone, FileText, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sezione, Dato, Indicatore } from "@/components/articoli/SchedaArticoloGamma";
import { salvaNoteFornitore, type DettaglioFornitore } from "@/lib/fornitori.functions";
import { TAB_SCHEDA_FORNITORE, sitoFornitore, origineLegameFornitore, type TabSchedaFornitore } from "@/lib/scheda-fornitore";
import { BadgeFornitore, BadgeMacrocategoria } from "./controlli-fornitori";
import { ArticoliFornitore } from "./ArticoliFornitore";

function dataGamma(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}
export type StatoArticoliFornitore = { ricerca: string; preferenziali: boolean; pagina: number; cambiaRicerca: (value: string) => void; cambiaPreferenziali: (value: boolean) => void; cambiaPagina: (value: number) => void };
export function SchedaFornitore({ fornitore: f, tab, onTabChange, statoArticoli }: { fornitore: DettaglioFornitore; tab: TabSchedaFornitore; onTabChange: (value: TabSchedaFornitore) => void; statoArticoli: StatoArticoliFornitore }) {
  const titoli = { panoramica: "Panoramica", articoli: `Articoli forniti (${f.n_articoli.toLocaleString("it-IT", { useGrouping: true })})`, clienti: "Cliente collegato" };
  const tabVisibili = TAB_SCHEDA_FORNITORE.filter(t => t !== "articoli" || f.puo_vedere_articoli);
  const tabAttiva = tabVisibili.includes(tab) ? tab : "panoramica";
  const codiciCliente = f.clienti.map(c => c.codice_gestionale).filter(Boolean).join(", ");
  return <div className="mt-3 min-w-0 space-y-4"><Card className="border-t-4 border-t-primary p-3 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="mb-2 text-sm font-semibold text-primary">Scheda fornitore</p><span className="font-mono text-sm text-muted-foreground">{f.codice_gestionale ?? "Senza codice Gamma"}</span><h1 className="mt-1 break-words text-2xl font-bold sm:text-3xl">{f.ragione_sociale || "Fornitore"}</h1>{f.alias && <p className="mt-2 break-words text-sm text-muted-foreground">{f.alias}</p>}</div><div className="flex flex-wrap gap-1"><BadgeMacrocategoria cod={f.macrocategoria_cod} desc={f.macrocategoria_desc} /><BadgeFornitore fornitore={f} /></div></div><div className={`mt-5 grid grid-cols-2 gap-2 ${f.puo_vedere_articoli ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>{f.puo_vedere_articoli && <><Indicatore label="Articoli forniti" value={f.n_articoli.toLocaleString("it-IT", { useGrouping: true })} /><Indicatore label="Fornitore preferenziale di" value={f.n_preferenziale.toLocaleString("it-IT", { useGrouping: true })} sotto="articoli" tono="success" /></>}<Indicatore label="Condizione di pagamento fornitore" value={f.condizione_pagamento_desc || "—"} sotto={f.condizione_pagamento_cod ?? undefined} testo /><Indicatore label="È anche cliente" value={f.clienti.length ? "Sì" : "No"} sotto={codiciCliente ? `Codice cliente ${codiciCliente}` : undefined} tono={f.clienti.length ? "success" : "primary"} testo /></div></Card><Tabs value={tabAttiva} onValueChange={value => { const next = tabVisibili.find(t => t === value); if (next) onTabChange(next); }}><TabsList aria-label="Sezioni della scheda fornitore" className="max-w-full md:justify-start">{tabVisibili.map(t => <TabsTrigger key={t} value={t} className="min-h-10">{titoli[t]}</TabsTrigger>)}</TabsList><TabsContent value="panoramica" className="mt-4"><div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-3"><Sezione titolo="Anagrafica" icon={Building2}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="P.IVA" value={f.partita_iva} /><Dato label="Codice fiscale" value={f.codice_fiscale} /><Dato label="Indirizzo" value={[f.indirizzo, [f.cap, f.citta, f.provincia ? `(${f.provincia})` : null].filter(Boolean).join(" ")].filter(Boolean).join(", ")} /><Dato label="Stato" value={f.stato} /></dl></Sezione><Sezione titolo="Gamma" icon={Calendar}><dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"><Dato label="Codice fornitore" value={f.codice_gestionale} /><Dato label="Macrocategoria" value={f.macrocategoria_cod ? `${f.macrocategoria_desc ?? "—"} (${f.macrocategoria_cod})` : "Da classificare"} /><Dato label="Anagrafica generale" value={f.codice_anagrafica_generale} /><Dato label="Codice cliente Gamma" value={f.codice_cliente_gamma} /><Dato label="Ultima modifica Gamma" value={dataGamma(f.ultima_modifica_gamma)} /><Dato label="Ultima sincronizzazione" value={dataGamma(f.ultima_sincronizzazione)} /></dl></Sezione></div><div className="min-w-0 space-y-3"><Sezione titolo="Contatti" icon={Phone}><ContattiFornitore fornitore={f} /></Sezione><Sezione titolo="Note interne" icon={FileText}><NoteFornitore fornitore={f} /></Sezione></div></div><p className="mt-3 text-xs text-muted-foreground">I dati anagrafici arrivano da Gamma e si aggiornano con l’import.</p></TabsContent>{f.puo_vedere_articoli && <TabsContent value="articoli" className="mt-4"><ArticoliFornitore id={f.id} {...statoArticoli} /></TabsContent>}<TabsContent value="clienti" className="mt-4"><ClientiFornitore clienti={f.clienti} /></TabsContent></Tabs></div>;
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
  return <form onSubmit={e => { e.preventDefault(); if (n <= 4000 && !mutation.isPending) mutation.mutate(); }} className="space-y-2"><Textarea aria-label="Note interne" rows={5} value={note} disabled={mutation.isPending} onChange={e => { if (Array.from(e.target.value).length <= 4000) setNote(e.target.value); }} /><p className="text-right text-xs text-muted-foreground tabular-nums">{n.toLocaleString("it-IT", { useGrouping: true })}/4000</p><Button type="submit" disabled={mutation.isPending || note === (f.note ?? "")} className="min-h-10 w-full"><Save className="mr-2 size-4" />{mutation.isPending ? "Salvataggio…" : "Salva note"}</Button>{mutation.error && <p role="alert" className="break-words text-sm text-destructive">{mutation.error.message}</p>}</form>;
}
export function ClientiFornitore({ clienti }: { clienti: DettaglioFornitore["clienti"] }) {
  if (!clienti.length) return <p className="py-6 text-muted-foreground">Questo fornitore non risulta cliente</p>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{clienti.map(c => <Sezione key={c.cliente_id} titolo={c.ragione_sociale || "Cliente"} icon={Users}><dl><Dato label="Codice cliente" value={c.codice_gestionale} /><Dato label="Negozio" value={c.store_nome} /></dl><div className="mt-3 flex flex-wrap gap-2">{c.bloccato && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Bloccato</Badge>}{c.in_gestione_legale && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">In gestione legale</Badge>}</div><p className="mt-3 break-words text-sm text-muted-foreground">{origineLegameFornitore(c.origine_legame, c.coincide_su)}</p><Button variant="outline" className="mt-3 min-h-10" asChild><Link to="/clienti/$clienteId" params={{ clienteId: c.cliente_id }}>Apri scheda cliente</Link></Button></Sezione>)}</div>;
}