// FM62 G5: email a più fornitori (stesso editor, oggetto e allegati della finestra
// singola; niente CC/CCN). Una email separata per fornitore, spedita in coda dal job.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Paperclip, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScegliFile } from "@/components/ui/scegli-file";
import { SchedaFileLocale } from "@/components/allegati/anteprima-allegato";
import { sanificaHtmlEmailFornitore, htmlInTesto, MAX_TESTO_FORNITORE, MAX_ALLEGATI_FORNITORE_BYTES } from "@/lib/comunicazioni-fornitore";
import { anteprimaInvioFornitori, avviaInvioFornitori } from "@/lib/invio-multiplo-fornitori.functions";
import { FINESTRA_FORNITORE, NO_AUTOFILL, fmtMB, leggiBase64 } from "./InviaEmailFornitoreDialog";

export function InviaEmailMultiplaDialog({ open, onOpenChange, fornitoriIds, onAvviato }: {
  open: boolean; onOpenChange: (v: boolean) => void; fornitoriIds: string[]; onAvviato: (invioId: string) => void;
}) {
  const [oggetto, setOggetto] = useState("");
  const [html, setHtml] = useState("");
  const [file, setFile] = useState<File[]>([]);
  const [pannello, setPannello] = useState(false);
  const [elenco, setElenco] = useState(false);
  const [chiave, setChiave] = useState(() => crypto.randomUUID());
  const [conferma, setConferma] = useState(false);
  const [invio, setInvio] = useState(false);
  const leggi = useServerFn(anteprimaInvioFornitori);
  const avvia = useServerFn(avviaInvioFornitori);
  useEffect(() => { if (open) { setOggetto(""); setHtml(""); setFile([]); setPannello(false); setElenco(false); setChiave(crypto.randomUUID()); setConferma(false); } }, [open]);
  const dest = useQuery({ queryKey: ["fornitori", "anteprima-invio", fornitoriIds], enabled: open && fornitoriIds.length > 0, queryFn: () => leggi({ data: { fornitoriIds } }) });
  const testo = useMemo(() => htmlInTesto(sanificaHtmlEmailFornitore(html)), [html]);
  const byte = file.reduce((s, f) => s + f.size, 0);
  const oltre = byte > MAX_ALLEGATI_FORNITORE_BYTES;
  const n = dest.data?.destinatari.length ?? 0;
  const pronto = !invio && n > 0 && oggetto.trim().length > 0 && oggetto.trim().length <= 200 && testo.trim().length > 0 && testo.length <= MAX_TESTO_FORNITORE && html.length <= 100000 && !oltre;

  async function esegui() {
    setInvio(true);
    try {
      const nuoviAllegati = await Promise.all(file.map(async f => ({ filename: f.name, contentType: f.type || "application/octet-stream", base64: await leggiBase64(f) })));
      const r = await avvia({ data: { chiaveInvio: chiave, fornitoriIds, oggetto, html, nuoviAllegati } });
      toast.success(`Invio avviato: ${r.totale.toLocaleString("it-IT")} email in coda${r.saltati ? `, ${r.saltati.toLocaleString("it-IT")} fornitori senza email saltati` : ""}`);
      onAvviato(r.invioId);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avvio dell'invio non riuscito", { duration: 12000 });
    } finally { setInvio(false); setConferma(false); }
  }

  const etichetta = (f: File, i: number) => <li key={`${f.name}-${i}`} className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5 text-xs ${oltre ? "border-destructive/50 bg-destructive/5" : "bg-muted/40"}`}>
    <Paperclip className="size-3 shrink-0 text-muted-foreground" /><span className="min-w-0 break-all">{f.name}</span><span className="shrink-0 text-muted-foreground">({fmtMB(f.size)})</span>
    <button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label={`Togli ${f.name}`} onClick={() => setFile(p => p.filter((_, j) => j !== i))}><X className="size-3.5" /></button></li>;

  return <Dialog open={open} onOpenChange={v => !invio && onOpenChange(v)}>
    <DialogContent className={FINESTRA_FORNITORE}>
      <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6">
        <DialogTitle className="flex items-center gap-2 pr-8"><Send className="size-5 shrink-0" />Email a {fornitoriIds.length.toLocaleString("it-IT")} fornitori</DialogTitle>
        <DialogDescription>Ogni fornitore riceve una email separata al suo indirizzo. Comunicazione di servizio, registrata nelle Attività di ciascuno.</DialogDescription>
      </DialogHeader>
      <form autoComplete="off" onSubmit={e => e.preventDefault()} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <section className="min-w-0 space-y-2 rounded-md border border-border p-3">
          {dest.isPending ? <p className="text-sm text-muted-foreground">Controllo gli indirizzi…</p>
            : dest.error ? <p className="text-sm text-destructive">{dest.error.message}</p>
            : <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm"><Users className="size-4 shrink-0 text-muted-foreground" /><span><strong className="tabular-nums">{n.toLocaleString("it-IT")}</strong> riceveranno l'email</span></p>
                <Button type="button" variant="ghost" size="sm" className="min-h-9 gap-1" aria-expanded={elenco} onClick={() => setElenco(v => !v)}>Vedi elenco<ChevronDown className={`size-3.5 transition-transform ${elenco ? "rotate-180" : ""}`} /></Button>
              </div>
              {!!dest.data?.saltati.length && <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{dest.data.saltati.length.toLocaleString("it-IT")} {dest.data.saltati.length === 1 ? "fornitore non ha" : "fornitori non hanno"} un'email valida e {dest.data.saltati.length === 1 ? "sarà saltato" : "saranno saltati"}.</span></div>}
              {elenco && dest.data && <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border text-sm">
                {dest.data.destinatari.map(d => <li key={d.id} className="flex min-w-0 flex-col px-3 py-1.5 sm:flex-row sm:justify-between sm:gap-3"><span className="min-w-0 break-words font-medium">{d.nome}</span><span className="min-w-0 break-all text-xs text-muted-foreground sm:text-sm">{d.email}</span></li>)}
                {dest.data.saltati.map(d => <li key={d.id} className="flex min-w-0 flex-col px-3 py-1.5 text-muted-foreground sm:flex-row sm:justify-between sm:gap-3"><span className="min-w-0 break-words">{d.nome}</span><span className="text-xs text-warning">senza email · saltato</span></li>)}
              </ul>}
            </>}
        </section>
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="email-multipla-oggetto">Oggetto</Label>
            <Button type="button" variant={pannello ? "secondary" : "ghost"} size="sm" aria-expanded={pannello} className={`min-h-9 gap-1.5 ${oltre ? "text-destructive" : ""}`} onClick={() => setPannello(v => !v)}>
              <Paperclip className="size-4" /><span>Allegati</span>
              {file.length > 0 && <span className={`rounded-full px-1.5 text-xs tabular-nums ${oltre ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{file.length}</span>}
              <ChevronDown className={`size-3.5 transition-transform ${pannello ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <Input id="email-multipla-oggetto" name="fm-oggetto-email-multipla" type="text" {...NO_AUTOFILL} className="min-h-10" maxLength={200} value={oggetto} onChange={e => setOggetto(e.target.value)} />
          {file.length > 0 && <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Allegati scelti">{file.map(etichetta)}</ul>}
          {(file.length > 0 || pannello) && <p className={`text-xs ${oltre ? "font-medium text-destructive" : "text-muted-foreground"}`}>Totale allegati: {fmtMB(byte)} di 10 MB, uguali per tutti{oltre ? " — limite superato, togli qualche file." : ""}</p>}
          {pannello && <div className={`min-w-0 space-y-2 rounded-md border p-3 ${oltre ? "border-destructive" : "border-border"}`}>
            <p className="text-sm font-medium">Dal dispositivo</p>
            <ScegliFile multiple onFiles={fs => setFile(p => [...p, ...fs])} nomi={file.map(f => f.name)} etichetta="Carica file" />
            {file.length > 0 && <ul className="space-y-1.5">{file.map((f, i) => <SchedaFileLocale key={`${f.name}-${i}`} file={f} onRimuovi={() => setFile(p => p.filter((_, j) => j !== i))} />)}</ul>}
          </div>}
        </div>
        <div className="space-y-1.5"><Label>Testo</Label>
          <RichTextEditor value={html} onChange={setHtml} caratteri compatto minHeight={240} maxHeight={420} ariaLabel="Testo dell'email" pulisciIncolla={sanificaHtmlEmailFornitore} />
          <p className="text-xs text-muted-foreground">Scrivi {"{{ragione_sociale}}"} per inserire il nome di ogni fornitore.</p>
          <p className={`text-right text-xs tabular-nums ${testo.length > MAX_TESTO_FORNITORE ? "text-destructive" : "text-muted-foreground"}`}>{testo.length.toLocaleString("it-IT")}/20.000</p></div>
      </form>
      <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="ghost" className="min-h-10" onClick={() => onOpenChange(false)} disabled={invio}>Annulla</Button>
        <Button className="min-h-10 gap-1.5" onClick={() => setConferma(true)} disabled={!pronto}><Send className="size-4" />{invio ? "Avvio…" : "Invia"}</Button>
      </DialogFooter>
      <AlertDialog open={conferma} onOpenChange={v => !invio && setConferma(v)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Inviare a {n.toLocaleString("it-IT")} {n === 1 ? "fornitore" : "fornitori"}?</AlertDialogTitle>
            <AlertDialogDescription>Parte una email separata per ciascuno, in coda con brevi pause.{dest.data?.saltati.length ? ` ${dest.data.saltati.length.toLocaleString("it-IT")} senza email saranno saltati.` : ""}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={invio}>Annulla</AlertDialogCancel><AlertDialogAction disabled={invio} onClick={e => { e.preventDefault(); void esegui(); }}>{invio ? "Avvio…" : "Invia"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}
