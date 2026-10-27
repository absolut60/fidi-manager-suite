// Bonifico di acconto nel dettaglio richiesta interna (FM48, fetta 3).
import { cn } from "@/lib/utils";
import { TitoloCard } from "./intestazione";
import { statoAcconto } from "./stili";
import { BadgeStile } from "./richieste-table";
// Permesso: puoGestireTesoreria (fonte unica src/lib/tesoreria-permessi.ts).
// Registrazione: SOLO segnaBonificoEseguito (server); qui carichiamo il CRO
// come allegato tipo 'cro_bonifico' e, se la registrazione fallisce, lo togliamo.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScegliFile } from "@/components/ui/scegli-file";
import { GRIGLIA_ALLEGATI, SchedaAllegato, SchedaFileLocale } from "@/components/allegati/anteprima-allegato";
import { RICHIESTE_ALLEGATI_BUCKET as BUCKET, sanitizeFileName } from "@/components/richieste-interne/utils";
import { puoGestireTesoreria } from "@/lib/tesoreria-permessi";
import { segnaBonificoEseguito } from "@/lib/richieste-bonifico.functions";

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_OK = ["application/pdf", "image/jpeg", "image/png"];

const fmtEuro = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtData = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
};
function oggiIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export type BonificoRichiesta = {
  id: string;
  status: string;
  acconto_richiesto: boolean;
  acconto_importo: number | null;
  acconto_data_prevista: string | null;
  acconto_stato: string | null;
  acconto_eseguito_at: string | null;
  acconto_eseguito_da_name: string | null;
  acconto_note: string | null;
};

export type AllegatoBonifico = {
  id: string; nome_file: string; storage_path: string; mime_type: string | null;
  dimensione_bytes: number | null; created_at: string; tipo?: string | null; caricato_da?: string | null;
};
type Allegato = AllegatoBonifico;

const APPROVATA = ["resp_approved", "approved"];
const ACCEPT_CRO = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

function erroreFileCro(f: File): string | null {
  return !MIME_OK.includes(f.type) ? "Formato non ammesso: solo PDF, JPG o PNG"
    : f.size > MAX_BYTES ? "File troppo grande: massimo 10 MB" : null;
}

export function BonificoAccontoCard({
  r, allegati, onEliminaAllegato, puoEliminareAllegato,
}: {
  r: BonificoRichiesta;
  allegati: Allegato[];
  /** Chiede conferma ed elimina (gestito dal dettaglio, stessa logica degli altri allegati). */
  onEliminaAllegato?: (a: Allegato) => void;
  /** Stessa regola delle policy: chi ha caricato il file o l'amministratore. */
  puoEliminareAllegato?: (a: Allegato) => boolean;
}) {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(oggiIso());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [caricandoCro, setCaricandoCro] = useState(false);

  if (!r.acconto_richiesto) return null;
  const cro = allegati.filter((a) => a.tipo === "cro_bonifico");
  const puoSegnare = puoGestireTesoreria(roles) && APPROVATA.includes(r.status) && r.acconto_stato === "da_eseguire";

  function apri() { setData(oggiIso()); setNote(""); setFile(null); setOpen(true); }

  /** Ricevuta aggiunta dopo l'esecuzione: stesso upload del CRO, senza toccare la registrazione. */
  async function aggiungiRicevuta(f: File) {
    const err = erroreFileCro(f);
    if (err) { toast.error(err); return; }
    if (!user?.id) return;
    setCaricandoCro(true);
    const path = `${r.id}/${Date.now()}_${sanitizeFileName(f.name)}`;
    try {
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw new Error("Caricamento ricevuta fallito: " + up.error.message);
      const ins = await supabase.from("richieste_interne_allegati").insert({
        request_id: r.id, nome_file: f.name, storage_path: path, mime_type: f.type,
        dimensione_bytes: f.size, caricato_da: user.id, tipo: "cro_bonifico",
      });
      if (ins.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error("Registrazione ricevuta fallita: " + ins.error.message);
      }
      toast.success("Ricevuta aggiunta");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setCaricandoCro(false);
      qc.invalidateQueries({ queryKey: ["richiesta-interna", r.id] });
    }
  }

  const erroreFile = file ? erroreFileCro(file) : null;
  const valido = !!data && data <= oggiIso() && note.length <= 2000 && !!file && !erroreFile;


  async function conferma() {
    if (!valido || !file || !user?.id) return;
    setSaving(true);
    const path = `${r.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
    let allegatoId: string | null = null;
    try {
      // a) file + riga allegato tipo cro_bonifico
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error("Caricamento ricevuta fallito: " + up.error.message);
      const ins = await supabase.from("richieste_interne_allegati").insert({
        request_id: r.id, nome_file: file.name, storage_path: path, mime_type: file.type,
        dimensione_bytes: file.size, caricato_da: user.id, tipo: "cro_bonifico",
      }).select("id").single();
      if (ins.error || !ins.data) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error("Registrazione ricevuta fallita: " + (ins.error?.message ?? ""));
      }
      allegatoId = ins.data.id;

      // b) registrazione
      let res: { ok: boolean; err?: string } | null = null;
      let errMsg: string | null = null;
      try {
        res = await segnaBonificoEseguito({ data: { richiestaId: r.id, eseguitoIl: data, note: note.trim() || undefined } });
        if (!res.ok) errMsg = res.err ?? "Registrazione non riuscita";
      } catch (e) {
        errMsg = e instanceof Error ? e.message : "Registrazione non riuscita";
      }
      // c) rollback ricevuta
      if (errMsg) {
        await supabase.from("richieste_interne_allegati").delete().eq("id", allegatoId);
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(errMsg);
      }
      // d)
      if (res?.err) toast.warning("Bonifico registrato, ma l'avviso al richiedente non è partito");
      else toast.success("Bonifico registrato");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setSaving(false);
      // e)
      qc.invalidateQueries({ queryKey: ["richiesta-interna", r.id] });
      qc.invalidateQueries({ queryKey: ["richieste-interne"] });
    }
  }

  const sa = statoAcconto(r);
  const stileAcc = sa.stile;
  return (
    <Card className={cn("border-l-4", stileAcc.bordo)}>
      <CardHeader className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <CardTitle><TitoloCard stile={stileAcc}>Bonifico di acconto</TitoloCard></CardTitle>
        {puoSegnare && (
          <Button size="sm" className="h-10 w-full sm:w-auto" onClick={apri}>Segna bonifico eseguito</Button>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 space-y-2 text-sm">
        <Riga label="Importo"><span className="font-mono">{fmtEuro(r.acconto_importo)}</span></Riga>
        <Riga label="Data prevista">{fmtData(r.acconto_data_prevista)}</Riga>
        <Riga label="Stato">
          <div className="space-y-1">
            <BadgeStile stile={sa.stile} testo={sa.testo} />
            {r.acconto_stato === "eseguito" && (
              <div className="text-muted-foreground">
                il {fmtData(r.acconto_eseguito_at)}{r.acconto_eseguito_da_name ? ` da ${r.acconto_eseguito_da_name}` : ""}
              </div>
            )}
            {r.acconto_note && <div className="whitespace-pre-wrap break-words border-l-2 pl-2">{r.acconto_note}</div>}
          </div>
        </Riga>
        {cro.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Ricevute CRO</div>
            <ul className={GRIGLIA_ALLEGATI}>
              {cro.map((a) => (
                <SchedaAllegato key={a.id} compatta storagePath={a.storage_path} nomeFile={a.nome_file}
                  mimeType={a.mime_type} dimensione={a.dimensione_bytes} bucket={BUCKET}
                  dettagli={<Badge variant="secondary">CRO</Badge>}
                  azioniStandard={{ onElimina: onEliminaAllegato && puoEliminareAllegato?.(a) ? () => onEliminaAllegato(a) : undefined }} />
              ))}
            </ul>
          </div>
        )}
        {r.acconto_stato === "eseguito" && cro.length === 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="flex min-w-0 flex-1 items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span className="min-w-0 break-words">Nessuna ricevuta CRO allegata</span>
            </span>
            {puoGestireTesoreria(roles) && (
              <ScegliFile accept={ACCEPT_CRO} etichetta={caricandoCro ? "Caricamento…" : "Aggiungi ricevuta"}
                disabled={caricandoCro} nomi={[]} className="sm:w-auto [&>span]:hidden"
                onFiles={(fs) => fs[0] && void aggiungiRicevuta(fs[0])} />
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none">
          <DialogHeader>
            <DialogTitle>Segna bonifico eseguito</DialogTitle>
            <DialogDescription>Acconto di {fmtEuro(r.acconto_importo)}. Il richiedente riceverà un avviso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bon-data">Data del bonifico <span className="text-destructive">*</span></Label>
              <div className="relative min-w-0">
                <Input id="bon-data" type="date" className="peer h-10 block w-full min-w-0 max-w-full appearance-none text-left bg-background text-foreground" placeholder="gg/mm/aaaa" max={oggiIso()} value={data} onChange={(e) => setData(e.target.value)} />
                {!data && (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground peer-focus:hidden md:text-sm">gg/mm/aaaa</span>
                )}
              </div>
              {data > oggiIso() && <p className="text-xs text-destructive">La data non può essere futura</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-note">Note</Label>
              <Textarea id="bon-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. numero CRO, banca…" />
              <p className="text-xs text-muted-foreground text-right">{note.length}/2000</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-cro">Ricevuta CRO <span className="text-destructive">*</span></Label>
              {file ? (
                <ul><SchedaFileLocale file={file} onRimuovi={() => setFile(null)} /></ul>
              ) : (
                <ScegliFile id="bon-cro" accept={ACCEPT_CRO} onFiles={(fs) => setFile(fs[0] ?? null)} />
              )}
              <p className="text-xs text-muted-foreground">PDF, JPG o PNG, massimo 10 MB.</p>
              {erroreFile && <p className="text-xs text-destructive">{erroreFile}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-10" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button className="h-10" onClick={conferma} disabled={!valido || saving}>
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Riga({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
