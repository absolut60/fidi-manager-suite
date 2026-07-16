import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Download, File as FileIcon, FileImage, FileText, Loader2, MapPin, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { ChatMessaggi } from "@/components/richieste-interne/chat-messaggi";

export const Route = createFileRoute("/_app/richieste-interne/$richiestaId")({
  component: DettaglioRichiesta,
});

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Approvazione preventivo",
  attivita: "Richiesta attività",
  acquisto: "Acquisto materiali/servizi",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ Att. Resp. Gen.",
  resp_approved: "✓ Approvata (Liv.1)",
  forwarded: "→ Att. Direzione",
  approved: "✓ Approvata",
  rejected: "✕ Rifiutata",
};

const RESP_ACTION_LABEL: Record<string, string> = {
  approved: "Approvata",
  forwarded: "Inoltrata alla Direzione",
  rejected: "Rifiutata",
};

const DIR_ACTION_LABEL: Record<string, string> = {
  approved: "Approvata",
  rejected: "Rifiutata",
};

const fmtEuro = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtDataOra = (v: string) =>
  new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtBytes = (n: number | null) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

function iconFor(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/pdf") return FileText;
  return FileIcon;
}

function DettaglioRichiesta() {
  const { richiestaId } = Route.useParams();
  const { user, profilo, hasRole } = useAuth();
  const router = useRouter();
  
  const qc = useQueryClient();
  const uid = user?.id ?? "";
  const fullName = [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ").trim() || (user?.email ?? "");

  const { data: r, isLoading, error } = useQuery({
    queryKey: ["richiesta-interna", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne")
        .select("*, richieste_interne_allegati(id, nome_file, storage_path, mime_type, dimensione_bytes, caricato_da, created_at, profili:caricato_da(nome, cognome))")
        .eq("id", richiestaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["richiesta-interna", richiestaId] });

  const canLiv1 = hasRole("approvatore_richieste_liv1") && r?.status === "pending";
  const canLiv2 = hasRole("approvatore_richieste_liv2") && r?.status === "forwarded";

  const [dialog, setDialog] = useState<null | { level: 1 | 2; action: "approved" | "forwarded" | "rejected" }>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitDecision() {
    if (!dialog || !r) return;
    setSaving(true);
    const now = new Date().toISOString();
    const patch = dialog.level === 1
      ? {
          resp_action: dialog.action,
          resp_approver_id: uid,
          resp_approver_name: fullName,
          resp_note: note.trim() || null,
          resp_at: now,
          status:
            dialog.action === "approved" ? "resp_approved" :
            dialog.action === "forwarded" ? "forwarded" : "rejected",
        }
      : {
          dir_action: dialog.action,
          dir_approver_id: uid,
          dir_approver_name: fullName,
          dir_note: note.trim() || null,
          dir_at: now,
          status: dialog.action === "approved" ? "approved" : "rejected",
        };
    const { error } = await supabase.from("richieste_interne").update(patch).eq("id", r.id);
    setSaving(false);
    if (error) {
      toast.error("Errore: " + error.message);
      return;
    }
    // TODO Strato 5: inviare email di notifica (richiedente + eventuale Direzione)
    toast.success("Decisione registrata");
    setDialog(null);
    setNote("");
    refresh();
  }

  async function openAllegato(path: string) {
    const { data, error } = await supabase.storage.from("richieste-allegati").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Impossibile aprire il file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !r) return;
    setUploading(true);
    const path = `${r.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("richieste-allegati")
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setUploading(false);
      toast.error("Upload fallito: " + upErr.message);
      return;
    }
    const { error: insErr } = await supabase.from("richieste_interne_allegati").insert({
      request_id: r.id,
      nome_file: file.name,
      storage_path: path,
      mime_type: file.type || null,
      dimensione_bytes: file.size,
      caricato_da: uid,
    });
    setUploading(false);
    if (insErr) {
      toast.error("Errore registrazione allegato: " + insErr.message);
      return;
    }
    toast.success("Allegato caricato");
    refresh();
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline mr-2" />Caricamento…</div>;
  }
  if (error || !r) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}><ArrowLeft className="size-4 mr-1" />Indietro</Button>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Richiesta non trovata</CardContent></Card>
      </div>
    );
  }

  const shortId = r.id.slice(0, 8).toUpperCase();
  const canUpload = !r.archived;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => router.history.back()} className="-ml-2 mb-1">
            <ArrowLeft className="size-4 mr-1" />Indietro
          </Button>
          <h1 className="text-2xl font-semibold">{r.title}</h1>
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">Richiesta #{shortId}</span>
            <span>·</span>
            <span>{r.requester_name}</span>
            {r.sede_name && (<><span>·</span><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{r.sede_name}</span></>)}
          </div>
        </div>
        <Badge variant="outline" className="text-sm">{STATUS_LABEL[r.status] ?? r.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* COLONNA SINISTRA */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Dati richiesta</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Tipo"><Badge variant="secondary">{TIPO_LABEL[r.type] ?? r.type}</Badge></Row>
              <Row label="Importo"><span className="font-mono">{fmtEuro(r.amount)}</span></Row>
              <Row label="Fornitore">{r.fornitore || "—"}</Row>
              <Row label="Sede">{r.sede_name || "—"}</Row>
              <Row label="Richiedente">{r.requester_name} · <span className="text-muted-foreground">{fmtDataOra(r.created_at)}</span></Row>
              {r.description && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Descrizione</div>
                  <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{r.description}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base inline-flex items-center gap-2"><Paperclip className="size-4" />Allegati ({r.richieste_interne_allegati?.length ?? 0})</CardTitle>
              {canUpload && (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
                    Carica
                  </Button>
                </>
              )}
            </CardHeader>
            <CardContent>
              {(r.richieste_interne_allegati?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">Nessun allegato</div>
              ) : (
                <ul className="divide-y">
                  {r.richieste_interne_allegati!.map((a: any) => {
                    const Ico = iconFor(a.mime_type);
                    const uploader = a.profili ? [a.profili.nome, a.profili.cognome].filter(Boolean).join(" ") : "—";
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <Ico className="size-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{a.nome_file}</div>
                          <div className="text-xs text-muted-foreground">{fmtBytes(a.dimensione_bytes)} · {uploader} · {fmtDataOra(a.created_at)}</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => openAllegato(a.storage_path)}>
                          <Download className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <ChatMessaggi richiestaId={r.id} disabled={r.archived} />

          {(canLiv1 || canLiv2) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Azioni</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {canLiv1 && (
                  <>
                    <Button onClick={() => { setNote(""); setDialog({ level: 1, action: "approved" }); }}>Approva</Button>
                    <Button variant="secondary" onClick={() => { setNote(""); setDialog({ level: 1, action: "forwarded" }); }}>Inoltra alla Direzione</Button>
                    <Button variant="destructive" onClick={() => { setNote(""); setDialog({ level: 1, action: "rejected" }); }}>Rifiuta</Button>
                  </>
                )}
                {canLiv2 && (
                  <>
                    <Button onClick={() => { setNote(""); setDialog({ level: 2, action: "approved" }); }}>Approva</Button>
                    <Button variant="destructive" onClick={() => { setNote(""); setDialog({ level: 2, action: "rejected" }); }}>Rifiuta</Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* COLONNA DESTRA */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Responsabile Generale</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {r.resp_at ? (
                <div className="space-y-1">
                  <div className="font-medium">{r.resp_approver_name}</div>
                  <div><Badge variant="outline">{RESP_ACTION_LABEL[r.resp_action!] ?? r.resp_action}</Badge></div>
                  {r.resp_note && <div className="text-muted-foreground whitespace-pre-wrap border-l-2 pl-2 mt-2">{r.resp_note}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{fmtDataOra(r.resp_at)}</div>
                </div>
              ) : (
                <div className="text-muted-foreground italic">In attesa</div>
              )}
            </CardContent>
          </Card>

          {(r.status === "forwarded" || r.dir_at) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Direzione</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {r.dir_at ? (
                  <div className="space-y-1">
                    <div className="font-medium">{r.dir_approver_name}</div>
                    <div><Badge variant="outline">{DIR_ACTION_LABEL[r.dir_action!] ?? r.dir_action}</Badge></div>
                    {r.dir_note && <div className="text-muted-foreground whitespace-pre-wrap border-l-2 pl-2 mt-2">{r.dir_note}</div>}
                    <div className="text-xs text-muted-foreground mt-1">{fmtDataOra(r.dir_at)}</div>
                  </div>
                ) : (
                  <div className="text-muted-foreground italic">In attesa</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog conferma azione */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) { setDialog(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "approved" && "Approva richiesta"}
              {dialog?.action === "forwarded" && "Inoltra alla Direzione"}
              {dialog?.action === "rejected" && "Rifiuta richiesta"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.action === "rejected"
                ? "Confermi il rifiuto? L'azione non è reversibile."
                : "Puoi aggiungere una nota (opzionale)."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opzionale)" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialog(null); setNote(""); }} disabled={saving}>Annulla</Button>
            <Button
              variant={dialog?.action === "rejected" ? "destructive" : "default"}
              onClick={submitDecision}
              disabled={saving}
            >
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="text-xs text-muted-foreground w-24 shrink-0">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
