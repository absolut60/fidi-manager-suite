// Bonifico di acconto nel dettaglio richiesta interna (FM48, fetta 3).
import { cn } from "@/lib/utils";
import { TitoloCard } from "./intestazione";
import { STILE_ACCONTO } from "./stili";
// Permesso: puoGestireTesoreria (fonte unica src/lib/tesoreria-permessi.ts).
// Registrazione: SOLO segnaBonificoEseguito (server); qui carichiamo il CRO
// come allegato tipo 'cro_bonifico' e, se la registrazione fallisce, lo togliamo.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GRIGLIA_ALLEGATI, SchedaAllegato } from "@/components/allegati/anteprima-allegato";
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

type Allegato = {
  id: string; nome_file: string; storage_path: string; mime_type: string | null;
  dimensione_bytes: number | null; created_at: string; tipo?: string | null;
};

const APPROVATA = ["resp_approved", "approved"];

export function statoBonifico(r: Pick<BonificoRichiesta, "status" | "acconto_stato" | "acconto_data_prevista">) {
  if (r.status === "rejected") return { label: "Annullato — richiesta rifiutata", cls: "bg-muted text-muted-foreground" };
  if (r.acconto_stato === "eseguito") return { label: "Eseguito", cls: "bg-success/15 text-success border-success/30" };
  if (!APPROVATA.includes(r.status)) return { label: "In attesa di approvazione", cls: "" };
  const scaduto = !!r.acconto_data_prevista && r.acconto_data_prevista < oggiIso();
  return { label: "Da eseguire", cls: scaduto ? "bg-warning/15 text-warning border-warning/40" : "" };
}

export function BonificoAccontoCard({ r, allegati }: { r: BonificoRichiesta; allegati: Allegato[] }) {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(oggiIso());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  if (!r.acconto_richiesto) return null;
  const stato = statoBonifico(r);
  const cro = allegati.filter((a) => a.tipo === "cro_bonifico");
  const puoSegnare = puoGestireTesoreria(roles) && APPROVATA.includes(r.status) && r.acconto_stato === "da_eseguire";

  function apri() { setData(oggiIso()); setNote(""); setFile(null); setOpen(true); }

  const erroreFile = file
    ? !MIME_OK.includes(file.type) ? "Formato non ammesso: solo PDF, JPG o PNG"
      : file.size > MAX_BYTES ? "File troppo grande: massimo 10 MB" : null
    : null;
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

  const stileAcc = r.acconto_stato === "eseguito" ? STILE_ACCONTO.eseguito : STILE_ACCONTO.da_eseguire;
  return (
    <Card className={cn("border-l-4", stileAcc.bordo)}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <CardTitle><TitoloCard stile={stileAcc}>Bonifico di acconto</TitoloCard></CardTitle>
        {puoSegnare && (
          <Button size="sm" className="h-10 w-full sm:w-auto" onClick={apri}>Segna bonifico eseguito</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Riga label="Importo"><span className="font-mono">{fmtEuro(r.acconto_importo)}</span></Riga>
        <Riga label="Data prevista">{fmtData(r.acconto_data_prevista)}</Riga>
        <Riga label="Stato">
          <div className="space-y-1">
            <Badge variant="outline" className={cn(stato.cls, APPROVATA.includes(r.status) && stileAcc.badge)}>{stato.label === "Eseguito" ? "✓ Eseguito" : stato.label}</Badge>
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
                <SchedaAllegato key={a.id} storagePath={a.storage_path} nomeFile={a.nome_file}
                  mimeType={a.mime_type} dimensione={a.dimensione_bytes} bucket={BUCKET}
                  dettagli={<Badge variant="secondary">CRO</Badge>} />
              ))}
            </ul>
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
              <Input id="bon-data" type="date" className="h-10" max={oggiIso()} value={data} onChange={(e) => setData(e.target.value)} />
              {data > oggiIso() && <p className="text-xs text-destructive">La data non può essere futura</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-note">Note</Label>
              <Textarea id="bon-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. numero CRO, banca…" />
              <p className="text-xs text-muted-foreground text-right">{note.length}/2000</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bon-cro">Ricevuta CRO <span className="text-destructive">*</span></Label>
              <Input id="bon-cro" type="file" className="h-10" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
      <div className="text-xs text-muted-foreground sm:w-28 shrink-0">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
