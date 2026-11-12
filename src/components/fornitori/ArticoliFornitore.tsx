import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { articoliFornitore, type ArticoloFornitore } from "@/lib/fornitori.functions";
import { dettaglioArticoloGamma } from "@/lib/catalogo-articoli.functions";
import { SchedaArticoloGamma } from "@/components/articoli/SchedaArticoloGamma";
import { SchedaLista } from "@/components/lista-responsive/scheda-lista";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ExternalLink, Search } from "lucide-react";
import { numeroAcquistoArticolo, type TabSchedaArticolo } from "@/lib/scheda-articolo";
import { ErroreFornitori, PaginazioneFornitori, useRicercaDifferita } from "./controlli-fornitori";

export function ArticoliFornitore({ id, ricerca, preferenziali, pagina, cambiaRicerca, cambiaPreferenziali, cambiaPagina }: { id: string; ricerca: string; preferenziali: boolean; pagina: number; cambiaRicerca: (value: string) => void; cambiaPreferenziali: (value: boolean) => void; cambiaPagina: (value: number) => void }) {
  const [testo, setTesto] = useRicercaDifferita(ricerca, cambiaRicerca);
  const [codice, setCodice] = useState<string | null>(null);
  const carica = useServerFn(articoliFornitore);
  const filtri = { fornitoreId: id, testo: ricerca, soloPreferenziali: preferenziali, limite: 50, offset: (pagina - 1) * 50 };
  const query = useQuery({ queryKey: ["fornitore-articoli", filtri], queryFn: () => carica({ data: filtri }) });
  return <div className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Cerca articoli del fornitore" className="min-h-10 pl-9" placeholder="Codice, descrizione, codice art. fornitore…" value={testo} onChange={e => setTesto(e.target.value)} /></div><label className="flex min-h-10 shrink-0 items-center gap-2 text-sm"><Switch checked={preferenziali} onCheckedChange={cambiaPreferenziali} />Solo preferenziale</label></div>{query.isPending ? <p role="status" className="py-6 text-muted-foreground">Caricamento articoli…</p> : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} /> : <><RigheArticoliFornitore rows={query.data.rows} apri={setCodice} /><PaginazioneFornitori totale={query.data.total} pagina={pagina} dimensione={50} nome="articoli" onChange={cambiaPagina} /></>}<FinestraArticolo codice={codice} chiudi={() => setCodice(null)} /></div>;
}
export function RigheArticoliFornitore({ rows, apri }: { rows: ArticoloFornitore[]; apri: (codice: string) => void }) {
  const stato = (a: ArticoloFornitore) => <Badge variant="outline" className={a.stato_gamma === "in_esaurimento" ? "border-warning/30 bg-warning/15 text-warning" : "border-success/30 bg-success/15 text-success"}>{a.stato_gamma === "in_esaurimento" ? "In esaurimento" : "In uso"}</Badge>;
  const pref = (a: ArticoloFornitore) => a.preferenziale ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Preferenziale</Badge> : null;
  if (!rows.length) return <p className="py-10 text-center text-muted-foreground">Nessun articolo trovato per questo fornitore.</p>;
  return <><div className="space-y-2 lg:hidden">{rows.map(a => <SchedaLista key={`${a.codice}-${a.codice_articolo_fornitore}`} onClick={() => apri(a.codice)} titolo={<><span className="block font-mono text-xs text-muted-foreground">{a.codice}</span><span className="line-clamp-2">{a.descrizione}</span></>} campi={[{ etichetta: "Marca", valore: a.marca || "—" }, { etichetta: "Famiglia", valore: a.famiglia || "—" }, { etichetta: "Cod. art. fornitore", valore: a.codice_articolo_fornitore || "—" }, { etichetta: "Costo ultimo", valore: numeroAcquistoArticolo(a.costo_ultimo, true) }]} footer={<>{stato(a)}{pref(a)}</>} />)}</div><table className="hidden w-full table-fixed text-xs lg:table"><colgroup><col className="w-[13%]" /><col className="w-[24%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[14%]" /></colgroup><thead className="bg-navy text-navy-foreground"><tr>{["Codice", "Descrizione", "Marca", "Famiglia", "Cod. art. fornitore", "Stato", "Costo ultimo"].map(t => <th scope="col" key={t} className="break-words px-2 py-3 text-left">{t}</th>)}</tr></thead><tbody>{rows.map(a => <tr key={`${a.codice}-${a.codice_articolo_fornitore}`} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => apri(a.codice)}><td className="break-words px-2 py-3 font-mono"><Button variant="link" className="h-auto min-h-10 max-w-full whitespace-normal p-0 text-left text-xs" onClick={e => { e.stopPropagation(); apri(a.codice); }}>{a.codice}</Button></td><td className="break-words px-2 py-3 font-medium">{a.descrizione}</td><td className="break-words px-2 py-3">{a.marca || "—"}</td><td className="break-words px-2 py-3">{a.famiglia || "—"}</td><td className="break-words px-2 py-3">{a.codice_articolo_fornitore || "—"}</td><td className="space-y-1 px-2 py-3">{stato(a)}{pref(a)}</td><td className="break-words px-2 py-3 text-right tabular-nums">{numeroAcquistoArticolo(a.costo_ultimo, true)}</td></tr>)}</tbody></table></>;
}
export function FinestraArticolo({ codice, chiudi }: { codice: string | null; chiudi: () => void }) {
  return <Sheet open={!!codice} onOpenChange={open => { if (!open) chiudi(); }}><SheetContent className="w-full max-w-full p-3 sm:w-[min(95vw,1100px)] sm:max-w-[1100px] sm:p-5" aria-describedby={undefined}><SheetTitle className="pr-8 text-sm">Scheda articolo</SheetTitle>{codice && <ContenutoFinestraArticolo key={codice} codice={codice} />}</SheetContent></Sheet>;
}
function ContenutoFinestraArticolo({ codice }: { codice: string }) {
  const carica = useServerFn(dettaglioArticoloGamma);
  const query = useQuery({ queryKey: ["catalogo-articolo", codice], queryFn: () => carica({ data: { codice } }) });
  const [tab, setTab] = useState<TabSchedaArticolo>("panoramica");
  return <><Button variant="outline" asChild className="mt-3 min-h-10"><Link to="/articoli/codice/$codice" params={{ codice }}><ExternalLink className="mr-2 size-4" />Apri scheda completa</Link></Button>{query.isPending ? <p role="status" className="py-6">Caricamento articolo…</p> : query.error ? <ErroreFornitori error={query.error} riprova={() => void query.refetch()} /> : query.data ? <SchedaArticoloGamma articolo={query.data} tab={tab} onTabChange={setTab} /> : <p className="py-6 text-muted-foreground">Articolo non trovato.</p>}</>;
}