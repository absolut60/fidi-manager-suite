import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, Download, Eye, ExternalLink, File as FileIcon, FileImage, FileText, Loader2,
  MessagesSquare, Paperclip, Pencil, Trash2, Upload, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CanaleConversazione } from "@/components/chat/canale-conversazione";
import { STATI, STATO_LABEL, STATO_BADGE, type StatoTask } from "@/lib/task-stato";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database["public"]["Tables"]["task"]["Row"];

const ALLEGATI_BUCKET = "allegati";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const fmtData = (v: string | null) =>
  v ? format(new Date(v), "d MMM yyyy", { locale: it }) : "—";

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

const isPreviewable = (mime: string | null) =>
  !!mime && mime.startsWith("image/");

export const Route = createFileRoute("/_app/task/$id")({
  component: TaskDetailPage,
  head: () => ({
    meta: [
      { title: "Attività — FidiManager" },
      { name: "description", content: "Dettaglio attività: dati, allegati e commenti." },
      { property: "og:title", content: "Attività — FidiManager" },
      { property: "og:description", content: "Dettaglio attività: dati, allegati e commenti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TaskDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const uid = user?.id ?? "";
  const isAdmin = hasRole("amministratore");

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("task").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as TaskRow | null;
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["task", "profili-assegnazione"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profili")
        .select("id, nome, cognome, attivo, store_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["task", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome, codice");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: aree } = useQuery({
    queryKey: ["task", "aree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aree_funzionali")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allegati } = useQuery({
    queryKey: ["task-allegati", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allegati")
        .select("*")
        .eq("entita_tipo", "task")
        .eq("entita_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  function nomeUtente(u: string | null) {
    if (!u) return null;
    const p = (profili ?? []).find((x) => x.id === u);
    if (!p) return "—";
    return [p.nome, p.cognome].filter(Boolean).join(" ") || "—";
  }

  function nomeSede(sid: string | null) {
    if (!sid) return null;
    const s = (stores ?? []).find((x) => x.id === sid);
    if (!s) return null;
    return [s.codice, s.nome].filter(Boolean).join(" - ");
  }

  function nomeArea(aid: string | null) {
    if (!aid) return "—";
    return (aree ?? []).find((a) => a.id === aid)?.nome ?? "—";
  }

  const canEdit = !!task && (isAdmin || task.titolare_id === uid || task.esecutore_id === uid);
  const canDelete = !!task && (isAdmin || task.titolare_id === uid);

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fTitolo, setFTitolo] = useState("");
  const [fDescrizione, setFDescrizione] = useState("");
  const [fAreaId, setFAreaId] = useState<string>("none");
  const [fScadenza, setFScadenza] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<null | "one" | "two">(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<null | { nome: string; url: string; mime: string | null }>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["task", id] });
    qc.invalidateQueries({ queryKey: ["task"] });
  };
  const refreshAllegati = () => qc.invalidateQueries({ queryKey: ["task-allegati", id] });

  const utentiFiltrati = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (profili ?? [])
      .filter((p) => p.attivo !== false)
      .filter((p) => {
        if (!q) return true;
        return `${p.nome ?? ""} ${p.cognome ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) =>
        `${a.cognome ?? ""}${a.nome ?? ""}`.localeCompare(`${b.cognome ?? ""}${b.nome ?? ""}`),
      );
  }, [profili, search]);

  async function uploadFiles(files: FileList | File[]) {
    if (!task) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    for (const file of list) {
      const path = `task/${task.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(ALLEGATI_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        toast.error(`Upload fallito (${file.name}): ${upErr.message}`);
        continue;
      }
      const { error: insErr } = await supabase.from("allegati").insert({
        entita_tipo: "task",
        entita_id: task.id,
        cliente_id: null,
        nome_file: file.name,
        storage_path: path,
        mime_type: file.type || null,
        dimensione_bytes: file.size,
        caricato_da: uid,
      });
      if (insErr) {
        toast.error(`Errore registrazione allegato: ${insErr.message}`);
        continue;
      }
      toast.success(`Caricato: ${file.name}`);
    }
    setUploading(false);
    refreshAllegati();
  }

  async function scarica(path: string, nomeFile: string) {
    const { data, error } = await supabase.storage.from(ALLEGATI_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error("Impossibile scaricare il file"); return; }
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error("Download fallito");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeFile;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Impossibile scaricare il file");
    }
  }

  async function apriAnteprima(a: any) {
    const { data, error } = await supabase.storage.from(ALLEGATI_BUCKET).createSignedUrl(a.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Impossibile aprire l'anteprima"); return; }
    setPreview({ nome: a.nome_file, url: data.signedUrl, mime: a.mime_type });
  }

  async function eliminaAllegato(a: any) {
    const { error: rmErr } = await supabase.storage.from(ALLEGATI_BUCKET).remove([a.storage_path]);
    if (rmErr) console.warn("Rimozione file fallita:", rmErr.message);
    const { error } = await supabase.from("allegati").delete().eq("id", a.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Allegato eliminato");
    refreshAllegati();
  }

  async function elimina() {
    if (!task) return;
    try {
      const paths = (allegati ?? []).map((a: any) => a.storage_path).filter(Boolean) as string[];
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from(ALLEGATI_BUCKET).remove(paths);
        if (rmErr) console.warn("Rimozione file bucket fallita:", rmErr.message);
      }
    } catch (e) {
      console.warn("Cleanup bucket fallito:", e);
    }
    const { error } = await supabase.from("task").delete().eq("id", task.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Attività eliminata");
    qc.invalidateQueries({ queryKey: ["task"] });
    navigate({ to: "/task" });
  }

  async function assegna(esecutoreId: string | null) {
    if (!task) return;
    const { error } = await supabase.from("task").update({ esecutore_id: esecutoreId }).eq("id", task.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    setAssignOpen(false);
    setSearch("");
    toast.success(esecutoreId ? "Esecutore assegnato" : "Esecutore rimosso");
    refresh();
  }

  function avviaModifica() {
    if (!task) return;
    setFTitolo(task.titolo);
    setFDescrizione(task.descrizione ?? "");
    setFAreaId(task.area_id ?? "none");
    setFScadenza(task.scadenza ? String(task.scadenza).slice(0, 10) : "");
    setEditMode(true);
  }

  async function salvaDati() {
    if (!task) return;
    if (!fTitolo.trim()) { toast.error("Il titolo è obbligatorio"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("task")
      .update({
        titolo: fTitolo.trim(),
        descrizione: fDescrizione.trim() || null,
        area_id: fAreaId === "none" ? null : fAreaId,
        scadenza: fScadenza || null,
      })
      .eq("id", task.id);
    setSaving(false);
    if (error) { toast.error("Errore: " + error.message); return; }
    setEditMode(false);
    toast.success("Attività aggiornata");
    refresh();
  }

  async function cambiaStato(nuovo: StatoTask) {
    if (!task) return;
    const { error } = await supabase.from("task").update({ stato: nuovo }).eq("id", task.id);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Stato aggiornato");
    refresh();
  }


  function indietro() {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else navigate({ to: "/task" });
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin inline mr-2" />Caricamento…
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={indietro}><ArrowLeft className="size-4 mr-1" />Indietro</Button>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Attività non trovata</CardContent></Card>
      </div>
    );
  }

  const stato = task.stato as StatoTask;
  const badge = STATO_BADGE[stato];
  const scaduta =
    !!task.scadenza &&
    isBefore(startOfDay(new Date(task.scadenza)), startOfDay(new Date())) &&
    stato !== "fatto" &&
    stato !== "annullato";

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={indietro} className="-ml-2 mb-1">
            <ArrowLeft className="size-4 mr-1" />Indietro
          </Button>
          <h1 className="text-2xl font-semibold">{task.titolo}</h1>
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Attività</span><span>·</span>
            <span>{nomeUtente(task.titolare_id) ?? "—"}</span><span>·</span>
            <span>creata il {fmtData(task.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={badge.variant} className={badge.className}>{STATO_LABEL[stato]}</Badge>
          <div className="flex flex-wrap gap-2 justify-end">
            {editMode ? (
              <>
                <Button size="sm" onClick={() => void salvaDati()} disabled={saving}>
                  {saving && <Loader2 className="size-4 mr-1 animate-spin" />}Salva
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} disabled={saving}>
                  Annulla
                </Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => { avviaModifica(); }}>
                    <Pencil className="size-4 mr-1" />Modifica
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDelete("one")}>
                    <Trash2 className="size-4 mr-1" />Elimina
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-4">
          {/* ASSEGNAZIONE compatta */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs text-muted-foreground">Esecutore</span>
              {task.esecutore_id ? (
                <span className="font-medium">{nomeUtente(task.esecutore_id)}</span>
              ) : (
                <span className="text-muted-foreground italic">Nessun esecutore assegnato</span>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => { setSearch(""); setAssignOpen(true); }}>
                  <UserPlus className="size-4 mr-1" />Assegna a
                </Button>
              )}
              {canEdit && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Stato</span>
                  <Select value={stato} onValueChange={(v) => void cambiaStato(v as StatoTask)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATI.map((s) => (
                        <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Dati attività</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {editMode ? (
                <>
                  <div className="space-y-1">
                    <Label>Titolo attività</Label>
                    <Input value={fTitolo} onChange={(e) => setFTitolo(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Descrizione attività</Label>
                    <Textarea rows={4} value={fDescrizione} onChange={(e) => setFDescrizione(e.target.value)} />
                  </div>
                  <Row label="Titolare">{nomeUtente(task.titolare_id) ?? "—"}</Row>
                  <Row label="Stato">
                    <Badge variant={badge.variant} className={badge.className}>{STATO_LABEL[stato]}</Badge>
                  </Row>
                  <div className="space-y-1">
                    <Label>Area di riferimento</Label>
                    <Select value={fAreaId} onValueChange={setFAreaId}>
                      <SelectTrigger><SelectValue placeholder="— Nessuna —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nessuna —</SelectItem>
                        {(aree ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Scadenza</Label>
                    <Input type="date" value={fScadenza} onChange={(e) => setFScadenza(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="text-lg font-semibold">{task.titolo}</div>
                    {task.descrizione ? (
                      <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-base">{task.descrizione}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">Nessuna descrizione</div>
                    )}
                  </div>
                  <div className="pt-4 border-t space-y-3">
                    <Row label="Titolare">{nomeUtente(task.titolare_id) ?? "—"}</Row>
                    <Row label="Stato">
                      <Badge variant={badge.variant} className={badge.className}>{STATO_LABEL[stato]}</Badge>
                    </Row>
                    <Row label="Scadenza">
                      {task.scadenza ? (
                        <span className={scaduta ? "text-destructive font-medium" : undefined}>{fmtData(task.scadenza)}</span>
                      ) : "—"}
                    </Row>
                    <Row label="Area di riferimento">{nomeArea(task.area_id)}</Row>
                  </div>
                </>
              )}
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base inline-flex items-center gap-2">
                <Paperclip className="size-4" />Allegati ({allegati?.length ?? 0})
              </CardTitle>
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    // Copia i file PRIMA di resettare il value: la FileList è live
                    // e si svuota azzerando l'input, annullando l'upload.
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    e.currentTarget.value = "";
                    if (files.length) void uploadFiles(files);
                  }}

                />
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
                  Carica
                </Button>
              </>
            </CardHeader>
            <CardContent
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
              }}
              className={`rounded-md transition-colors ${dragging ? "border-2 border-dashed border-primary bg-primary/5" : "border-2 border-transparent"}`}
            >
              {(allegati?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Nessun allegato — trascina qui i file per caricarli
                </div>
              ) : (
                <ul className="divide-y">
                  {(allegati ?? []).map((a: any) => {
                    const Ico = iconFor(a.mime_type);
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <Ico className="size-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{a.nome_file}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtBytes(a.dimensione_bytes)} · {nomeUtente(a.caricato_da) ?? "—"} · {fmtData(a.created_at)}
                          </div>
                        </div>
                        {isPreviewable(a.mime_type) && (
                          <Button size="sm" variant="ghost" onClick={() => apriAnteprima(a)} title="Anteprima">
                            <Eye className="size-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => scarica(a.storage_path, a.nome_file)} title="Scarica">
                          <Download className="size-4" />
                        </Button>
                        {(isAdmin || a.caricato_da === uid) && (
                          <Button size="sm" variant="ghost" onClick={() => eliminaAllegato(a)} title="Elimina">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="h-[60vh] flex flex-col">
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                <MessagesSquare className="size-4" />Commenti
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {task.canale_id ? (
                <CanaleConversazione canaleId={task.canale_id} />
              ) : (
                <div className="text-sm text-muted-foreground text-center py-6">Nessun canale commenti disponibile</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog assegnazione */}
      <Dialog open={assignOpen} onOpenChange={(o) => { setAssignOpen(o); if (!o) setSearch(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna esecutore</DialogTitle>
            <DialogDescription>Cerca e seleziona la persona a cui assegnare l'attività.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Cerca per nome o cognome…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-muted-foreground"
              onClick={() => assegna(null)}
            >
              — Nessun esecutore —
            </button>
            {utentiFiltrati.map((p) => {
              const sede = nomeSede(p.store_id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  onClick={() => assegna(p.id)}
                >
                  {[p.nome, p.cognome].filter(Boolean).join(" ") || "—"}
                  {sede && <span className="text-muted-foreground"> — {sede}</span>}
                </button>
              );
            })}
            {utentiFiltrati.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">Nessun utente trovato</div>
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* Anteprima allegato */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle className="truncate">{preview?.nome}</DialogTitle></DialogHeader>
          {preview?.mime?.startsWith("image/") && (
            <img src={preview.url} alt={preview.nome} className="max-h-[75vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* Doppia conferma eliminazione */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina definitivamente</DialogTitle>
            <DialogDescription>
              {confirmDelete === "one"
                ? `Vuoi eliminare l'attività "${task.titolo}"? L'operazione è irreversibile.`
                : `Conferma finale: eliminare "${task.titolo}" e tutti i suoi dati?`}
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
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="text-xs text-muted-foreground w-28 shrink-0">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

