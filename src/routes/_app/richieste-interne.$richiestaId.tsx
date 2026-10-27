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
import { ArrowLeft, Archive, ArchiveRestore, Download, Eye, File as FileIcon, FileImage, FileText, Loader2, MapPin, Paperclip, Pencil, Search, Trash2, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ChatMessaggi } from "@/components/richieste-interne/chat-messaggi";
import { GestisciDialog, type GestisciTarget } from "@/components/richieste-interne/gestisci-dialog";
import { NuovaRichiestaDialog } from "@/components/richieste-interne/nuova-richiesta-dialog";
import {
  STILE_ACCONTO, STILE_ARCHIVIATA, STILE_CREATA, STILE_DECISIONE, STILE_IN_ATTESA, STILE_PAGINA, STILE_ALLEGATI, STILE_AZIONI,
  stileAdmin, stilePrincipale, stileStatus, stileTipo, type StileVoce,
} from "@/components/richieste-interne/stili";
import { IntestazioneRichieste, TitoloCard } from "@/components/richieste-interne/intestazione";
import { BadgeStile } from "@/components/richieste-interne/richieste-table";
import { cn } from "@/lib/utils";


import { notifyRichiestaEvento } from "@/lib/richieste-email.functions";
import { sanitizeFileName } from "@/components/richieste-interne/utils";
import { BonificoAccontoCard } from "@/components/richieste-interne/bonifico-acconto-card";



export const Route = createFileRoute("/_app/richieste-interne/$richiestaId")({
  component: DettaglioRichiesta,
});

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
import { GRIGLIA_ALLEGATI, SchedaAllegato } from "@/components/allegati/anteprima-allegato";
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
        .select("*, richieste_interne_allegati(id, nome_file, storage_path, mime_type, dimensione_bytes, caricato_da, created_at, tipo, profili:caricato_da(nome, cognome))")
        .eq("id", richiestaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["richiesta-interna", richiestaId] });
    qc.invalidateQueries({ queryKey: ["richieste-interne"] });
  };

  const canLiv1 = hasRole("approvatore_richieste_liv1") && r?.status === "pending";
  const canLiv2 = hasRole("approvatore_richieste_liv2") && r?.status === "forwarded";
  const canManage = hasRole("amministratore") || hasRole("gestore_richieste") || hasRole("esecutore_richieste");
  const canGestisci = canManage && r && !r.archived && (r.status === "resp_approved" || r.status === "approved");
  const canDelete = hasRole("amministratore");
  const isOwner = !!r && r.requester_id === uid;
  const ownerCanEdit = !!r && isOwner && r.status === "pending" && !r.archived;
  const ownerCanDelete = ownerCanEdit;
  const [editOpen, setEditOpen] = useState(false);

  const [dialog, setDialog] = useState<null | { level: 1 | 2; action: "approved" | "forwarded" | "rejected" }>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [gestOpen, setGestOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<null | "one" | "two">(null);
  const [allegatoDaEliminare, setAllegatoDaEliminare] = useState<any>(null);


  async function archivia() {
    if (!r) return;
    if (!confirm(`Archiviare la richiesta "${r.title}"?`)) return;
    setArchiving(true);
    const { error } = await supabase
      .from("richieste_interne")
      .update({ archived: true, archived_at: new Date().toISOString(), archived_by_name: fullName })
      .eq("id", r.id);
    setArchiving(false);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Richiesta archiviata");
    refresh();
    router.history.back();
  }

  async function ripristina() {
    if (!r) return;
    setArchiving(true);
    const { error } = await supabase
      .from("richieste_interne")
      .update({ archived: false, archived_at: null, archived_by_name: null })
      .eq("id", r.id);
    setArchiving(false);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Richiesta ripristinata");
    refresh();
  }

  async function elimina() {
    if (!r) return;
    // Rimuovi prima i file dal bucket (per non lasciare orfani).
    try {
      const { data: allegati } = await supabase
        .from("richieste_interne_allegati")
        .select("storage_path")
        .eq("request_id", r.id);
      const paths = (allegati ?? []).map((a) => a.storage_path).filter(Boolean) as string[];
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from("richieste-allegati").remove(paths);
        if (rmErr) console.warn("Rimozione file bucket fallita:", rmErr.message);
      }
    } catch (e) {
      console.warn("Cleanup bucket fallito:", e);
    }
    const { error } = await supabase.from("richieste_interne").delete().eq("id", r.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Richiesta eliminata");
    qc.invalidateQueries({ queryKey: ["richieste-interne"] });
    router.history.back();
  }


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
    // Strato 5: notifica email (non blocca)
    const event =
      dialog.level === 1
        ? dialog.action === "approved"
          ? "resp_approved"
          : dialog.action === "forwarded"
            ? "resp_forwarded"
            : "resp_rejected"
        : dialog.action === "approved"
          ? "dir_approved"
          : "dir_rejected";
    try {
      const res = await notifyRichiestaEvento({
        data: {
          event,
          richiestaId: r.id,
          actor: { id: uid, nome: fullName, email: user?.email ?? null },
        },
      });
      if (!res.ok) console.warn(`[notifica ${event}] enqueue fallito:`, res.err);
    } catch (e) {
      console.error(`[email ${event}] fallito:`, e);
    }


    toast.success("Decisione registrata");
    setDialog(null);
    setNote("");
    refresh();
  }

  async function eliminaAllegato(a: any) {
    const { error: rmErr } = await supabase.storage.from("richieste-allegati").remove([a.storage_path]);
    if (rmErr) console.warn("Rimozione file fallita:", rmErr.message);
    const { error } = await supabase.from("richieste_interne_allegati").delete().eq("id", a.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Allegato eliminato");
    refresh();
  }


  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !r) return;
    setUploading(true);
    const path = `${r.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
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
    <div className="space-y-4 max-w-4xl">
      <IntestazioneRichieste
        sopra={
          <Button variant="ghost" size="sm" onClick={() => router.history.back()} className="-ml-2 min-h-10">
            <ArrowLeft className="size-4 mr-1" />Indietro
          </Button>
        }
        stile={stilePrincipale(r)}
        titolo={r.title}
        sottotitolo={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">Richiesta #{shortId}</span>
            <span>·</span>
            <span>{r.requester_name}</span>
            {r.sede_name && (<><span>·</span><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{r.sede_name}</span></>)}
          </span>
        }
      />

      {(() => {
        const sp = stilePrincipale(r);
        const Ic = sp.icona;
        const approvata = r.status === "resp_approved" || r.status === "approved";
        return (
          <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium", sp.fascia)}>
            <Ic className="size-4 shrink-0" aria-hidden />
            <span className="break-words">
              {stileStatus(r.status).label}{approvata ? ` · ${stileAdmin(r.admin_status).label}` : ""}
            </span>
            {r.archived && <BadgeStile stile={STILE_ARCHIVIATA} className="ml-auto" />}
          </div>
        );
      })()}

      {(ownerCanEdit || canGestisci || canManage || canDelete || ownerCanDelete) && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&_button]:min-h-10">
          {ownerCanEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4 mr-1" />Modifica
            </Button>
          )}
          {canGestisci && (
            <Button variant="outline" onClick={() => setGestOpen(true)}>
              <Wrench className="size-4 mr-1" />Gestisci
            </Button>
          )}
          {canManage && !r.archived && (
            <Button variant="outline" onClick={archivia} disabled={archiving}>
              <Archive className="size-4 mr-1" />Archivia
            </Button>
          )}
          {canManage && r.archived && (
            <Button variant="outline" onClick={ripristina} disabled={archiving}>
              <ArchiveRestore className="size-4 mr-1" />Ripristina
            </Button>
          )}
          {(canDelete || ownerCanDelete) && (
            <Button variant="destructive" className="sm:ml-auto" onClick={() => setConfirmDelete("one")}>
              <Trash2 className="size-4 mr-1" />Elimina
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle><TitoloCard stile={STILE_PAGINA.dettaglio}>Dati richiesta</TitoloCard></CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <BadgeStile stile={stileTipo(r.type)} />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Importo</div>
              <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums">{fmtEuro(r.amount)}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Row label="Fornitore">{r.fornitore || "—"}</Row>
            <Row label="Sede">{r.sede_name || "—"}</Row>
            <Row label="Richiedente">{r.requester_name}</Row>
            <Row label="Creata il">{fmtDataOra(r.created_at)}</Row>
          </div>
          {r.description && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Descrizione</div>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{r.description}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <BonificoAccontoCard r={r} allegati={(r.richieste_interne_allegati ?? []) as any} />

      <Card>
        <CardHeader><CardTitle><TitoloCard stile={STILE_CREATA}>Iter di approvazione</TitoloCard></CardTitle></CardHeader>
        <CardContent className="text-sm">
          <ol className="space-y-0">
            <Passo stile={STILE_CREATA} titolo="Creata">
              <div>{r.requester_name}</div>
              <div className="text-xs text-muted-foreground">{fmtDataOra(r.created_at)}</div>
            </Passo>
            <Passo stile={r.resp_at ? esitoStile(r.resp_action) : STILE_IN_ATTESA} titolo="Responsabile Generale" ultimo={!(r.status === "forwarded" || r.dir_at) && !(r.status === "resp_approved" || r.status === "approved") && !r.acconto_richiesto}>
              {r.resp_at ? (
                <>
                  <div className="font-medium">{r.resp_approver_name}</div>
                  <BadgeStile stile={esitoStile(r.resp_action)} testo={RESP_ACTION_LABEL[r.resp_action!] ?? r.resp_action} />
                  {r.resp_note && <div className="text-muted-foreground whitespace-pre-wrap break-words border-l-2 pl-2 mt-1">{r.resp_note}</div>}
                  <div className="text-xs text-muted-foreground">{fmtDataOra(r.resp_at)}</div>
                </>
              ) : <div className="text-muted-foreground italic">In attesa</div>}
            </Passo>
            {(r.status === "forwarded" || r.dir_at) && (
              <Passo stile={r.dir_at ? esitoStile(r.dir_action) : STILE_IN_ATTESA} titolo="Direzione" ultimo={!(r.status === "resp_approved" || r.status === "approved") && !r.acconto_richiesto}>
                {r.dir_at ? (
                  <>
                    <div className="font-medium">{r.dir_approver_name}</div>
                    <BadgeStile stile={esitoStile(r.dir_action)} testo={DIR_ACTION_LABEL[r.dir_action!] ?? r.dir_action} />
                    {r.dir_note && <div className="text-muted-foreground whitespace-pre-wrap break-words border-l-2 pl-2 mt-1">{r.dir_note}</div>}
                    <div className="text-xs text-muted-foreground">{fmtDataOra(r.dir_at)}</div>
                  </>
                ) : <div className="text-muted-foreground italic">In attesa</div>}
              </Passo>
            )}
            {r.status !== "rejected" && (
              <Passo
                stile={(r.status === "resp_approved" || r.status === "approved") ? stileAdmin(r.admin_status) : STILE_IN_ATTESA}
                titolo="Gestione"
                ultimo={!r.acconto_richiesto}
              >
                {(r.status === "resp_approved" || r.status === "approved") ? (
                  <>
                    <BadgeStile stile={stileAdmin(r.admin_status)} />
                    {r.admin_note && <div className="text-muted-foreground whitespace-pre-wrap break-words border-l-2 pl-2 mt-1">{r.admin_note}</div>}
                  </>
                ) : <div className="text-muted-foreground italic">In attesa</div>}
              </Passo>
            )}
            {r.acconto_richiesto && (
              <Passo
                stile={r.acconto_stato === "eseguito" ? STILE_ACCONTO.eseguito : (r.status === "resp_approved" || r.status === "approved") ? STILE_ACCONTO.da_eseguire : STILE_IN_ATTESA}
                titolo="Bonifico di acconto"
                ultimo
              >
                {r.acconto_stato === "eseguito" ? (
                  <BadgeStile stile={STILE_ACCONTO.eseguito} testo="✓ Eseguito" />
                ) : (r.status === "resp_approved" || r.status === "approved") ? (
                  <BadgeStile stile={STILE_ACCONTO.da_eseguire} testo="Da eseguire" />
                ) : <div className="text-muted-foreground italic">In attesa</div>}
              </Passo>
            )}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle><TitoloCard stile={STILE_ALLEGATI}>Allegati ({r.richieste_interne_allegati?.length ?? 0})</TitoloCard></CardTitle>
          {canUpload && (
            <>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
              <Button size="sm" variant="outline" className="min-h-10" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
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
            <ul className={GRIGLIA_ALLEGATI}>
              {r.richieste_interne_allegati!.map((a: any) => {
                const uploader = a.profili ? [a.profili.nome, a.profili.cognome].filter(Boolean).join(" ") : "—";
                const canDeleteAllegato = hasRole("amministratore") || a.caricato_da === uid;
                return (
                  <SchedaAllegato
                    key={a.id}
                    storagePath={a.storage_path}
                    nomeFile={a.nome_file}
                    mimeType={a.mime_type}
                    dimensione={a.dimensione_bytes}
                    bucket="richieste-allegati"
                    dettagli={<>{a.tipo === "cro_bonifico" && <Badge variant="secondary" className="mr-1">CRO</Badge>}{uploader} · {fmtDataOra(a.created_at)}</>}
                    azioni={canDeleteAllegato ? (
                      <Button size="icon" variant="ghost" className="size-10 text-destructive hover:text-destructive" onClick={() => setAllegatoDaEliminare(a)} title="Elimina" aria-label={`Elimina ${a.nome_file}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {(canLiv1 || canLiv2) && (
        <Card className="border-2 border-primary/30">
          <CardHeader><CardTitle><TitoloCard stile={STILE_AZIONI}>Azioni</TitoloCard></CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {canLiv1 && (
              <>
                <BottoneDecisione stile={STILE_DECISIONE.approva} onClick={() => { setNote(""); setDialog({ level: 1, action: "approved" }); }} />
                <BottoneDecisione stile={STILE_DECISIONE.inoltra} onClick={() => { setNote(""); setDialog({ level: 1, action: "forwarded" }); }} />
                <BottoneDecisione stile={STILE_DECISIONE.rifiuta} onClick={() => { setNote(""); setDialog({ level: 1, action: "rejected" }); }} />
              </>
            )}
            {canLiv2 && (
              <>
                <BottoneDecisione stile={STILE_DECISIONE.approva} onClick={() => { setNote(""); setDialog({ level: 2, action: "approved" }); }} />
                <BottoneDecisione stile={STILE_DECISIONE.rifiuta} onClick={() => { setNote(""); setDialog({ level: 2, action: "rejected" }); }} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ChatMessaggi richiestaId={r.id} disabled={r.archived} status={r.status} archived={r.archived} />

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

      <GestisciDialog
        open={gestOpen}
        target={r ? {
          id: r.id,
          title: r.title,
          admin_status: r.admin_status,
          admin_note: r.admin_note ?? null,
          sent_to_gestionale: r.sent_to_gestionale ?? false,
          gestionale_ref: r.gestionale_ref ?? null,
        } as GestisciTarget : null}
        onOpenChange={setGestOpen}
        onSaved={refresh}
      />

      {ownerCanEdit && r && (
        <NuovaRichiestaDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            id: r.id,
            title: r.title,
            type: r.type as "preventivo" | "attivita" | "acquisto",
            amount: r.amount,
            fornitore: r.fornitore ?? null,
            sede_id: r.sede_id ?? null,
            description: r.description ?? null,
            acconto_richiesto: r.acconto_richiesto,
            acconto_importo: r.acconto_importo,
            acconto_data_prevista: r.acconto_data_prevista,
          }}
        />
      )}

      {/* Doppia conferma eliminazione */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina definitivamente</DialogTitle>
            <DialogDescription>
              {confirmDelete === "one"
                ? `Vuoi eliminare la richiesta "${r?.title}"? L'operazione è irreversibile.`
                : `Conferma finale: eliminare "${r?.title}" e tutti i suoi dati?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Annulla</Button>
            {confirmDelete === "one" ? (
              <Button variant="destructive" onClick={() => setConfirmDelete("two")}>Continua</Button>
            ) : (
              <Button variant="destructive" onClick={async () => { setConfirmDelete(null); await elimina(); }}>
                Elimina definitivamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Conferma eliminazione allegato */}
      <Dialog open={!!allegatoDaEliminare} onOpenChange={(o) => { if (!o) setAllegatoDaEliminare(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina allegato</DialogTitle>
            <DialogDescription>
              Vuoi eliminare l&apos;allegato &quot;{allegatoDaEliminare?.nome_file}&quot;? L&apos;operazione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAllegatoDaEliminare(null)}>Annulla</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const a = allegatoDaEliminare;
                setAllegatoDaEliminare(null);
                if (a) await eliminaAllegato(a);
              }}
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function esitoStile(a: string | null | undefined): StileVoce {
  if (a === "approved") return STILE_DECISIONE.approva;
  if (a === "forwarded") return STILE_DECISIONE.inoltra;
  if (a === "rejected") return STILE_DECISIONE.rifiuta;
  return STILE_IN_ATTESA;
}

function Passo({ stile, titolo, ultimo, children }: { stile: StileVoce; titolo: string; ultimo?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!ultimo && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-border" aria-hidden />}
      <span className={cn("relative mt-1 size-4 shrink-0 rounded-full ring-4 ring-background", stile.pallino)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</div>
        {children}
      </div>
    </li>
  );
}

function BottoneDecisione({ stile, onClick }: { stile: StileVoce; onClick: () => void }) {
  const Ic = stile.icona;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex min-h-12 items-center justify-center gap-2 rounded-lg border border-t-4 px-4 py-2 text-sm font-semibold transition hover:opacity-90", stile.bordoAlto, stile.fascia)}
    >
      <Ic className="size-4" aria-hidden />{stile.label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="text-xs text-muted-foreground w-24 shrink-0">{label}</div>
      <div className="flex-1 min-w-0 break-words">{children}</div>
    </div>
  );
}
