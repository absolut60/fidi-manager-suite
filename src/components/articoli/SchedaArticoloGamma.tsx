import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberInputIt } from "@/components/ui/number-input-it";
import { updateArticolo } from "@/lib/articoli-api";
import { dettaglioArticoloGamma } from "@/lib/catalogo-articoli.functions";
import { prezzoArticolo } from "@/lib/catalogo-articoli";
import { ORDINE_LISTINI_ARTICOLO, numeroAcquistoArticolo, patchTecniciArticolo, type TecniciArticolo } from "@/lib/scheda-articolo";

export type DettaglioGamma = NonNullable<Awaited<ReturnType<typeof dettaglioArticoloGamma>>>;

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return <section className="min-w-0 border-t py-4" aria-label={titolo}><h2 className="mb-3 text-lg font-semibold text-navy">{titolo}</h2>{children}</section>;
}
function Dato({ label, value }: { label: string; value: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2 border-b py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value ?? "—"}</dd></div>;
}
function dataGamma(value: string | null, ora = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", ...(ora ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" } : {}) });
}

export function SchedaArticoloGamma({ articolo: a }: { articolo: DettaglioGamma }) {
  const listini = ORDINE_LISTINI_ARTICOLO.map((codice) => ({ codice,
    descrizione: a.listini.find((l) => l.codice === codice)?.descrizione ?? "—",
    prezzo: a.prezzi.find((l) => l.listino === codice),
  }));
  return <>
    <header className="py-4">
      <h1 className="text-2xl font-bold text-navy">Scheda articolo</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3"><span className="break-all font-mono font-semibold">{a.codice}</span><Badge variant={!a.attivo ? "destructive" : a.stato_gamma === "in_esaurimento" ? "secondary" : "outline"}>{!a.attivo ? "Dismesso in Gamma" : a.stato_gamma === "in_esaurimento" ? "In esaurimento" : "In uso"}</Badge></div>
      <p className="mt-2 break-words text-lg font-medium">{a.descrizione ?? "—"}</p>
      {a.descrizione_estesa && a.descrizione_estesa.trim() !== a.descrizione?.trim() && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{a.descrizione_estesa}</p>}
      <p className="mt-2 text-sm text-muted-foreground">{a.marche?.descrizione ?? "—"}</p>
      {!a.attivo && <p role="alert" className="mt-3 border-l-4 border-destructive bg-destructive/10 p-3 text-sm text-destructive">Articolo dismesso in Gamma: non è più vendibile.</p>}
    </header>
    <div className="grid min-w-0 grid-cols-1 gap-x-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <Sezione titolo="Anagrafica Gamma"><dl className="grid grid-cols-1 gap-x-5 md:grid-cols-2">
          <Dato label="Famiglia" value={a.famiglia} /><Dato label="Sottofamiglia" value={a.sottofamiglia} />
          <Dato label="U.M." value={a.um} /><Dato label="U.M. 2" value={a.um2} />
          <Dato label="Conversione" value={a.fattore_conversione?.toLocaleString("it-IT")} /><Dato label="IVA" value={a.iva} />
          <Dato label="Peso netto" value={a.peso_netto?.toLocaleString("it-IT")} /><Dato label="Codice a barre" value={a.codice_a_barre} />
          <Dato label="Fornitore preferenziale" value={a.fornitore?.ragione_sociale} /><Dato label="Codice art. fornitore" value={a.codice_articolo_fornitore} />
          <Dato label="N. fornitori" value={a.n_fornitori?.toLocaleString("it-IT")} /><Dato label="Premio fornitore" value={a.premio_fornitore} />
          <Dato label="Creato in Gamma" value={dataGamma(a.data_creazione_gamma)} /><Dato label="Aggiornato in Gamma" value={dataGamma(a.data_aggiornamento_gamma)} />
          <Dato label="Ultima sincronizzazione" value={dataGamma(a.ultima_sincronizzazione, true)} />
        </dl></Sezione>
        <Sezione titolo="Prezzi di vendita"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th scope="col" className="py-2 font-medium">Listino</th><th scope="col" className="py-2 text-right font-medium">Prezzo</th></tr></thead><tbody>{listini.map((l) => <tr key={l.codice} className="border-b"><th scope="row" className="py-3 pr-3 text-left font-normal">{l.codice} · {l.descrizione}</th><td className="whitespace-nowrap py-3 text-right font-mono tabular-nums">{prezzoArticolo(l.prezzo?.prezzo_vendita ?? null)}</td></tr>)}</tbody></table></div></Sezione>
        <Sezione titolo="Listino d'acquisto"><div className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Listini d’acquisto, tabella scorrevole"><table className="w-full min-w-[660px] table-fixed text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th scope="col" className="w-[18%] py-2 font-medium">Listino</th>{["Prezzo fornitore", "Sc1 %", "Sc2 %", "Sc3 %", "Trasporto %", "Trasporto €", "Netto"].map((t) => <th scope="col" key={t} className="px-1 py-2 text-right font-medium">{t}</th>)}</tr></thead><tbody>{listini.map((l) => <tr key={l.codice} className="border-b"><th scope="row" className="break-words py-3 pr-2 text-left font-normal">{l.codice} · {l.descrizione}</th>{[l.prezzo?.acq_prezzo, l.prezzo?.acq_sc1, l.prezzo?.acq_sc2, l.prezzo?.acq_sc3, l.prezzo?.acq_trasporto_perc, l.prezzo?.acq_trasporto_euro, l.prezzo?.costo_acquisto].map((v, i) => <td key={i} className={`px-1 py-3 text-right font-mono tabular-nums ${i === 6 ? "font-semibold" : ""}`}>{numeroAcquistoArticolo(v)}</td>)}</tr>)}</tbody></table></div></Sezione>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <Sezione titolo="Costi di magazzino"><dl><Dato label="Costo ultimo" value={numeroAcquistoArticolo(a.costo_ultimo, true)} /><Dato label="Costo medio" value={numeroAcquistoArticolo(a.costo_medio, true)} /><Dato label="Costo FIFO" value={numeroAcquistoArticolo(a.costo_fifo, true)} /></dl><p className="mt-2 text-sm text-muted-foreground">Costo ultimo: usato per il margine nei preventivi.</p></Sezione>
        <Sezione titolo="Dati tecnici — Sistema MADE">{a.tecnico ? <FormTecnici key={a.tecnico.id} tecnico={a.tecnico} codice={a.codice} modificabile={a.puoModificareTecnici} /> : <p className="text-sm text-muted-foreground">Nessun dato tecnico Sistema MADE per questo articolo.</p>}</Sezione>
      </aside>
    </div>
  </>;
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
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}><fieldset disabled={save.isPending} className="space-y-3">
    {testi.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><Input className="min-h-11" value={form[campo] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value || null }))} /></label>)}
    {numeri.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><NumberInputIt className="min-h-11" value={form[campo] ?? null} onChange={(value) => setForm((f) => ({ ...f, [campo]: value }))} /></label>)}
    {note.map(({ campo, label }) => <label key={campo} className="block space-y-1 text-sm"><span>{label}</span><Textarea rows={3} value={form[campo] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value || null }))} /></label>)}
    <Button type="submit" className="min-h-11 w-full" disabled={save.isPending}><Save className="mr-2 size-4" />{save.isPending ? "Salvataggio…" : "Salva dati tecnici"}</Button>
  </fieldset></form>;
}