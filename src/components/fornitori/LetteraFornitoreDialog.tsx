// FM62 G4/G5: finestra "Lettera" (comunicazione libera). Un fornitore: anteprima,
// Scarica PDF, Allega a un'email. Più fornitori: un unico PDF da stampare.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisualizzatoreAllegato } from "@/components/allegati/anteprima-allegato";
import { salvaFile } from "@/lib/salva-file";
import { sanificaHtmlEmailFornitore, htmlInTesto, MAX_TESTO_FORNITORE } from "@/lib/comunicazioni-fornitore";
import { generaLetteraFornitore, generaLettereFornitori } from "@/lib/lettera-fornitore.functions";
import { FINESTRA_FORNITORE, NO_AUTOFILL } from "./InviaEmailFornitoreDialog";

function pdfDaBase64(b64: string, nome: string): File {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new File([out], nome, { type: "application/pdf" });
}

export function LetteraFornitoreDialog({ open, onOpenChange, fornitore, fornitoriIds, onRegistrata, onAllegaEmail }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  /** Lettera singola… */
  fornitore?: { id: string; ragione_sociale: string | null };
  /** …oppure stampa multipla (max 200). */
  fornitoriIds?: string[];
  onRegistrata?: () => void;
  onAllegaEmail?: (pdf: File, oggetto: string) => void;
}) {
  const multipla = !fornitore;
  const ids = fornitore ? [fornitore.id] : fornitoriIds ?? [];
  const [oggetto, setOggetto] = useState("");
  const [html, setHtml] = useState("");
  const [lavoro, setLavoro] = useState<null | "anteprima" | "scarica" | "allega">(null);
  const [anteprima, setAnteprima] = useState<File | null>(null);
  const singola = useServerFn(generaLetteraFornitore);
  const tante = useServerFn(generaLettereFornitori);
  useEffect(() => { if (open) { setOggetto(""); setHtml(""); setAnteprima(null); } }, [open]);
  const testo = htmlInTesto(sanificaHtmlEmailFornitore(html));
  const pronto = !lavoro && ids.length > 0 && oggetto.trim().length > 0 && oggetto.trim().length <= 200 && testo.trim().length > 0 && testo.length <= MAX_TESTO_FORNITORE;

  async function esegui(azione: "anteprima" | "scarica" | "allega") {
    setLavoro(azione);
    try {
      if (azione === "anteprima") {
        const r = await singola({ data: { fornitoreId: ids[0], oggetto, html, salvaInAttivita: false } });
        setAnteprima(pdfDaBase64(r.pdfBase64, r.fileName));
        return;
      }
      if (multipla) {
        const r = await tante({ data: { fornitoriIds: ids, oggetto, html } });
        await salvaFile(pdfDaBase64(r.pdfBase64, r.fileName), r.fileName);
        r.avvisi.forEach(a => toast.warning(a, { duration: 10000 }));
        toast.success(`${r.lettere.toLocaleString("it-IT")} lettere generate e registrate nelle Attività`);
      } else {
        const r = await singola({ data: { fornitoreId: ids[0], oggetto, html, salvaInAttivita: true } });
        const pdf = pdfDaBase64(r.pdfBase64, r.fileName);
        if (azione === "scarica") { await salvaFile(pdf, r.fileName); toast.success("Lettera scaricata e registrata nelle Attività"); }
        else { toast.success("Lettera registrata nelle Attività"); onAllegaEmail?.(pdf, oggetto.trim()); }
      }
      onRegistrata?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generazione della lettera non riuscita", { duration: 12000 });
    } finally { setLavoro(null); }
  }

  return <Dialog open={open} onOpenChange={v => !lavoro && onOpenChange(v)}>
    <DialogContent className={FINESTRA_FORNITORE}>
      <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6">
        <DialogTitle className="flex items-center gap-2 pr-8"><FileText className="size-5 shrink-0" />{multipla ? `Lettere a ${ids.length.toLocaleString("it-IT")} fornitori` : "Lettera al fornitore"}</DialogTitle>
        <DialogDescription className="break-words">{multipla
          ? "Un unico PDF con una lettera per fornitore, su carta intestata MADE. Ogni lettera viene registrata nelle Attività del fornitore."
          : <>Fornitore: <strong>{fornitore?.ragione_sociale || "—"}</strong> · carta intestata MADE, registrata nelle Attività</>}</DialogDescription>
      </DialogHeader>
      <form autoComplete="off" onSubmit={e => e.preventDefault()} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="space-y-1.5"><Label htmlFor="lettera-oggetto">Oggetto</Label>
          <Input id="lettera-oggetto" name="fm-oggetto-lettera-fornitore" type="text" {...NO_AUTOFILL} className="min-h-10" maxLength={200} value={oggetto} onChange={e => setOggetto(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Testo</Label>
          <RichTextEditor value={html} onChange={setHtml} caratteri compatto minHeight={260} maxHeight={460} ariaLabel="Testo della lettera" pulisciIncolla={sanificaHtmlEmailFornitore} />
          <p className="text-xs text-muted-foreground">Nel PDF restano grassetto, corsivo, sottolineato, elenchi e allineamento; carattere e colori diventano quelli della carta intestata.{multipla ? " Scrivi {{ragione_sociale}} per il nome di ogni fornitore." : ""}</p>
          <p className={`text-right text-xs tabular-nums ${testo.length > MAX_TESTO_FORNITORE ? "text-destructive" : "text-muted-foreground"}`}>{testo.length.toLocaleString("it-IT")}/20.000</p></div>
      </form>
      <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="ghost" className="min-h-10" onClick={() => onOpenChange(false)} disabled={!!lavoro}>Annulla</Button>
        <Button variant="outline" className="min-h-10 gap-1.5" disabled={!pronto} onClick={() => void esegui("anteprima")}><Eye className="size-4" />{lavoro === "anteprima" ? "Preparo…" : multipla ? "Anteprima (prima lettera)" : "Anteprima"}</Button>
        {!multipla && onAllegaEmail && <Button variant="outline" className="min-h-10 gap-1.5" disabled={!pronto} onClick={() => void esegui("allega")}><Paperclip className="size-4" />{lavoro === "allega" ? "Preparo…" : "Allega a un'email"}</Button>}
        <Button className="min-h-10 gap-1.5" disabled={!pronto} onClick={() => void esegui("scarica")}><Download className="size-4" />{lavoro === "scarica" ? "Preparo…" : multipla ? "Scarica lettere" : "Scarica PDF"}</Button>
      </DialogFooter>
      {anteprima && <VisualizzatoreAllegato open={!!anteprima} onOpenChange={v => { if (!v) setAnteprima(null); }} file={anteprima} nomeFile={anteprima.name} tipo="pdf" mimeType="application/pdf" />}
    </DialogContent>
  </Dialog>;
}
