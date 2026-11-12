// FM62 G3: finestra "Invia email" al fornitore (stile InviaEmailRecuperoDialog,
// telefono a tutto schermo). Invio solo via inviaEmailFornitore.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScegliFile } from "@/components/ui/scegli-file";
import { SchedaFileLocale } from "@/components/allegati/anteprima-allegato";
import { isEmailValida } from "@/lib/email-validazione";
import { inviaEmailFornitore } from "@/lib/comunicazioni-fornitore.functions";
import { MAX_ALLEGATI_FORNITORE_BYTES, MAX_DESTINATARI_A, MAX_INDIRIZZI_FORNITORE, type EsitoInvioFornitore } from "@/lib/comunicazioni-fornitore";

export type FornitoreEmail = { id: string; ragione_sociale: string | null; email: string | null; pec: string | null };
type AllegatoFornitore = { id: string; nome_file: string; dimensione_bytes: number | null; created_at: string };

const fmtMB = (b: number) => `${(b / (1024 * 1024)).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result ?? ""); resolve(s.slice(s.indexOf(",") + 1)); };
    r.onerror = () => reject(new Error(`Impossibile leggere "${file.name}"`));
    r.readAsDataURL(file);
  });
}
function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return <section className="min-w-0 space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titolo}</h3>{children}</section>;
}

/** Campo con più indirizzi: Invio, virgola o "Aggiungi" li trasformano in etichette rimovibili. */
function CampoIndirizzi({ id, label, valori, onChange, max, suggerimenti }: {
  id: string; label: string; valori: string[]; onChange: (v: string[]) => void; max?: number;
  suggerimenti?: { etichetta: string; valore: string; nota?: string }[];
}) {
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const aggiungi = (raw: string) => {
    const nuovi = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (!nuovi.length) return;
    const nonValidi = nuovi.filter(e => !isEmailValida(e));
    if (nonValidi.length) { setErrore(`Indirizzo non valido: ${nonValidi[0]}`); return; }
    const out = [...valori];
    for (const e of nuovi) if (!out.some(x => x.toLowerCase() === e.toLowerCase())) out.push(e);
    if (max && out.length > max) { setErrore(`Massimo ${max} indirizzi in questo campo.`); return; }
    onChange(out); setTesto(""); setErrore(null);
  };
  const libere = (suggerimenti ?? []).filter(s => !valori.some(v => v.toLowerCase() === s.valore.toLowerCase()));
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {valori.length > 0 && <ul className="flex flex-wrap gap-1.5">{valori.map(v => <li key={v} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-sm"><span className="min-w-0 break-all">{v}</span><button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive" aria-label={`Togli ${v}`} onClick={() => onChange(valori.filter(x => x !== v))}><X className="size-3.5" /></button></li>)}</ul>}
    <div className="flex min-w-0 gap-2">
      <Input id={id} type="email" inputMode="email" autoComplete="off" className="min-h-10 min-w-0 flex-1" placeholder="nome@esempio.it" value={testo}
        onChange={e => { setTesto(e.target.value); setErrore(null); }}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); aggiungi(testo); } }}
        onBlur={() => { if (testo.trim()) aggiungi(testo); }} />
      <Button type="button" variant="outline" className="min-h-10 shrink-0" onClick={() => aggiungi(testo)} disabled={!testo.trim()}><Plus className="size-4" /><span className="sr-only sm:not-sr-only">Aggiungi</span></Button>
    </div>
    {libere.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs">{libere.map(s => <span key={s.etichetta} className="inline-flex flex-wrap items-center gap-1">
      <button type="button" className="inline-flex min-h-8 items-center rounded-full border border-dashed px-2.5 text-primary hover:bg-primary/5" onClick={() => aggiungi(s.valore)}>+ {s.etichetta}: <span className="ml-1 break-all">{s.valore}</span></button>
      {s.nota && <span className="text-[11px] text-muted-foreground">{s.nota}</span>}
    </span>)}</div>}
    {errore && <p className="text-xs text-destructive">{errore}</p>}
  </div>;
}

export function InviaEmailFornitoreDialog({ fornitore, open, onOpenChange, onInviata }: {
  fornitore: FornitoreEmail; open: boolean; onOpenChange: (v: boolean) => void; onInviata: (e: EsitoInvioFornitore) => void;
}) {
  const { user } = useAuth();
  const emailIo = user?.email ?? null;
  const emailForn = fornitore.email?.trim() && isEmailValida(fornitore.email.trim()) ? fornitore.email.trim() : null;
  const pecForn = fornitore.pec?.trim() && isEmailValida(fornitore.pec.trim()) ? fornitore.pec.trim() : null;
  const [a, setA] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [ccn, setCcn] = useState<string[]>([]);
  const [oggetto, setOggetto] = useState("");
  const [testo, setTesto] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File[]>([]);
  const [chiave, setChiave] = useState(() => crypto.randomUUID());
  const [conferma, setConferma] = useState(false);
  const [invio, setInvio] = useState(false);
  const invia = useServerFn(inviaEmailFornitore);

  useEffect(() => {
    if (!open) return;
    setA(emailForn ? [emailForn] : []); setCc([]); setCcn([]); setOggetto(""); setTesto(""); setSel(new Set()); setFile([]);
    setChiave(crypto.randomUUID()); setConferma(false);
  }, [open, fornitore.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const allegati = useQuery({
    queryKey: ["allegati", "fornitore", fornitore.id, "per-email"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("allegati").select("id, nome_file, dimensione_bytes, created_at")
        .eq("entita_tipo", "fornitore").eq("entita_id", fornitore.id).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AllegatoFornitore[];
    },
  });
  const byte = useMemo(() => file.reduce((s, f) => s + f.size, 0) + (allegati.data ?? []).filter(x => sel.has(x.id)).reduce((s, x) => s + Number(x.dimensione_bytes ?? 0), 0), [file, sel, allegati.data]);
  const oltre = byte > MAX_ALLEGATI_FORNITORE_BYTES;
  const totaleIndirizzi = a.length + cc.length + ccn.length;
  const doppioni = (() => { const t = [...a, ...cc, ...ccn].map(x => x.toLowerCase()); return t.length !== new Set(t).size; })();
  const pronto = a.length > 0 && oggetto.trim().length > 0 && oggetto.trim().length <= 200 && testo.trim().length > 0 && !oltre && totaleIndirizzi <= MAX_INDIRIZZI_FORNITORE && !doppioni && !invio;

  async function esegui() {
    setInvio(true);
    try {
      const nuoviAllegati = await Promise.all(file.map(async f => ({ filename: f.name, contentType: f.type || "application/octet-stream", base64: await leggiBase64(f) })));
      const r = await invia({ data: { fornitoreId: fornitore.id, chiaveInvio: chiave, a, cc, ccn, oggetto, testo, allegatiIds: [...sel], nuoviAllegati } });
      if (r.stato === "inviata") toast.success(r.giaInviata ? "Email già inviata in precedenza: nessun nuovo invio" : "Email inviata e registrata nelle Attività");
      else if (r.stato === "errore") toast.error(`Invio non riuscito: ${r.errore ?? "errore sconosciuto"}. Registrato nelle Attività.`, { duration: 12000 });
      else toast.message("Invio ancora in corso: controlla le Attività tra poco");
      for (const av of r.avvisi) toast.warning(av, { duration: 10000 });
      onInviata(r);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito", { duration: 12000 });
    } finally { setInvio(false); setConferma(false); }
  }

  const contentCls = "flex flex-col gap-0 p-0 left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-hidden " +
    "sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg";
  return <Dialog open={open} onOpenChange={v => !invio && onOpenChange(v)}>
    <DialogContent className={contentCls}>
      <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6">
        <DialogTitle className="flex items-center gap-2 pr-8"><Send className="size-5 shrink-0" /> Invia email al fornitore</DialogTitle>
        <DialogDescription className="break-words">Fornitore: <strong>{fornitore.ragione_sociale || "—"}</strong> · comunicazione di servizio, registrata nelle Attività</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <Sezione titolo="Destinatari">
          <CampoIndirizzi id="email-a" label="A" valori={a} onChange={setA} max={MAX_DESTINATARI_A}
            suggerimenti={[...(emailForn ? [{ etichetta: "Email", valore: emailForn }] : []), ...(pecForn ? [{ etichetta: "PEC", valore: pecForn, nota: "parte come email normale, non come PEC certificata" }] : [])]} />
          {!emailForn && <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Il fornitore non ha un indirizzo email in anagrafica: inseriscilo a mano.</span></div>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CampoIndirizzi id="email-cc" label="CC" valori={cc} onChange={setCc} suggerimenti={emailIo ? [{ etichetta: "Io", valore: emailIo }] : []} />
            <CampoIndirizzi id="email-ccn" label="CCN" valori={ccn} onChange={setCcn} suggerimenti={emailIo ? [{ etichetta: "Io", valore: emailIo }] : []} />
          </div>
          {(totaleIndirizzi > MAX_INDIRIZZI_FORNITORE || doppioni) && <p className="text-xs text-destructive">{doppioni ? "Lo stesso indirizzo compare in più campi: toglilo da uno." : `Massimo ${MAX_INDIRIZZI_FORNITORE} indirizzi in totale tra A, CC e CCN.`}</p>}
        </Sezione>
        <Sezione titolo="Messaggio">
          <div className="space-y-1.5"><Label htmlFor="email-oggetto">Oggetto</Label><Input id="email-oggetto" className="min-h-10" maxLength={200} value={oggetto} onChange={e => setOggetto(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="email-testo">Testo</Label><Textarea id="email-testo" rows={10} maxLength={20000} value={testo} onChange={e => setTesto(e.target.value)} placeholder="Scrivi il messaggio: gli a capo vengono rispettati." />
            <p className="text-right text-xs tabular-nums text-muted-foreground">{testo.length.toLocaleString("it-IT")}/20.000</p></div>
        </Sezione>
        <Sezione titolo="Allegati">
          <div className="space-y-2">
            <p className="text-sm font-medium">Dalla scheda fornitore</p>
            {allegati.isPending ? <p className="text-sm text-muted-foreground">Caricamento…</p>
              : !allegati.data?.length ? <p className="text-sm text-muted-foreground">Nessun allegato nella scheda fornitore.</p>
              : <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">{allegati.data.map(x => <label key={x.id} className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm">
                  <Checkbox className="mt-0.5" checked={sel.has(x.id)} onCheckedChange={v => { const n = new Set(sel); if (v) n.add(x.id); else n.delete(x.id); setSel(n); }} />
                  <span className="min-w-0 flex-1"><span className="block break-all font-medium">{x.nome_file}</span><span className="block text-xs text-muted-foreground">{new Date(x.created_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}{x.dimensione_bytes ? ` · ${fmtMB(x.dimensione_bytes)}` : ""}</span></span>
                </label>)}</div>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Dal dispositivo</p>
            <ScegliFile multiple onFiles={fs => setFile(prev => [...prev, ...fs])} nomi={file.map(f => f.name)} etichetta="Carica file" />
            {file.length > 0 && <ul className="space-y-1.5">{file.map((f, i) => <SchedaFileLocale key={`${f.name}-${i}`} file={f} onRimuovi={() => setFile(prev => prev.filter((_, j) => j !== i))} />)}</ul>}
          </div>
          <p className={`text-sm ${oltre ? "font-medium text-destructive" : "text-muted-foreground"}`}>Totale allegati: {fmtMB(byte)} di 10 MB{oltre ? " — limite superato, togli qualche file." : ""}</p>
        </Sezione>
      </div>
      <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="ghost" className="min-h-10" onClick={() => onOpenChange(false)} disabled={invio}>Annulla</Button>
        <Button className="min-h-10 gap-1.5" onClick={() => setConferma(true)} disabled={!pronto}><Send className="size-4" />{invio ? "Invio in corso…" : "Invia"}</Button>
      </DialogFooter>
      <AlertDialog open={conferma} onOpenChange={v => !invio && setConferma(v)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Inviare a {totaleIndirizzi} {totaleIndirizzi === 1 ? "destinatario" : "destinatari"}?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">A: {a.join(", ")}{cc.length ? ` · CC: ${cc.join(", ")}` : ""}{ccn.length ? ` · CCN: ${ccn.join(", ")}` : ""}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={invio}>Annulla</AlertDialogCancel><AlertDialogAction disabled={invio} onClick={e => { e.preventDefault(); void esegui(); }}>{invio ? "Invio in corso…" : "Invia"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}
