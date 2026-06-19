import { useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Paperclip, Upload, Download, Trash2, Loader2, FileText, Image as ImageIcon,
  File as FileIcon, Plus, Eye, UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AllegatoEntitaTipo =
  | "cliente"
  | "assicurazione"
  | "pratica_legale"
  | "azione_recupero"
  | "richiesta_fido";

export const ALLEGATI_BUCKET = "allegati";
export const ALLEGATI_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const ALLEGATI_ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

type AllegatoRow = {
  id: string;
  nome_file: string;
  storage_path: string;
  mime_type: string | null;
  dimensione_bytes: number | null;
  descrizione: string | null;
  caricato_da: string | null;
  created_at: string;
};

type Props = {
  entitaTipo: AllegatoEntitaTipo;
  entitaId: string;
  clienteId: string;
  canEdit?: boolean;
  title?: string;
  compact?: boolean;
};

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtDate(s: string): string {
  try { return new Date(s).toLocaleString("it-IT"); } catch { return s; }
}
function iconFor(mime: string | null) {
  if (!mime) return <FileIcon className="size-4" />;
  if (mime.startsWith("image/")) return <ImageIcon className="size-4" />;
  if (mime === "application/pdf") return <FileText className="size-4" />;
  return <FileIcon className="size-4" />;
}
function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}
function isPreviewable(mime: string | null): boolean {
  if (!mime) return false;
  return mime === "application/pdf" || mime.startsWith("image/");
}

export function validateAllegatoFile(f: File): string | null {
  if (f.size > ALLEGATI_MAX_BYTES) {
    return `File troppo grande (max ${ALLEGATI_MAX_BYTES / 1024 / 1024} MB)`;
  }
  if (f.type && !ALLEGATI_ALLOWED_MIMES.has(f.type)) {
    return `Tipo file non consentito: ${f.type}`;
  }
  return null;
}

/** Upload di un file nel bucket allegati + insert riga su public.allegati.
 *  Ritorna { ok:true } o { ok:false, error }. Se l'insert fallisce rimuove il file. */
export async function uploadAllegatoFile(params: {
  file: File;
  descrizione?: string | null;
  entitaTipo: AllegatoEntitaTipo;
  entitaId: string;
  clienteId: string;
  userId: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { file, descrizione, entitaTipo, entitaId, clienteId, userId } = params;
  try {
    const uid = crypto.randomUUID();
    const path = `${entitaTipo}/${entitaId}/${uid}-${sanitize(file.name)}`;
    const { error: eUp } = await supabase.storage
      .from(ALLEGATI_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (eUp) return { ok: false, error: eUp.message };
    const { error: eIns } = await supabase.from("allegati").insert({
      entita_tipo: entitaTipo,
      entita_id: entitaId,
      cliente_id: clienteId,
      nome_file: file.name,
      storage_path: path,
      mime_type: file.type || null,
      dimensione_bytes: file.size,
      descrizione: (descrizione ?? "").trim() || null,
      caricato_da: userId ?? null,
    });
    if (eIns) {
      await supabase.storage.from(ALLEGATI_BUCKET).remove([path]);
      return { ok: false, error: eIns.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Errore upload" };
  }
}

export function fmtAllegatoBytes(n: number | null): string {
  return fmtBytes(n);
}

export function AllegatiSection({
  entitaTipo, entitaId, clienteId, canEdit = true, title = "Allegati", compact = false,
}: Props) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const canManageAll =
    roles.includes("amministratore") || roles.includes("amministrazione");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AllegatoRow | null>(null);

  const key = ["allegati", entitaTipo, entitaId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allegati")
        .select("id, nome_file, storage_path, mime_type, dimensione_bytes, descrizione, caricato_da, created_at")
        .eq("entita_tipo", entitaTipo)
        .eq("entita_id", entitaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AllegatoRow[];
    },
  });

  const del = useMutation({
    mutationFn: async (a: AllegatoRow) => {
      const { error } = await supabase.from("allegati").delete().eq("id", a.id);
      if (error) throw error;
      await supabase.storage.from(ALLEGATI_BUCKET).remove([a.storage_path]);
    },
    onSuccess: () => {
      toast.success("Allegato eliminato");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openSigned(a: AllegatoRow, mode: "download" | "preview") {
    const { data, error } = await supabase.storage
      .from(ALLEGATI_BUCKET)
      .createSignedUrl(a.storage_path, 60);
    if (error || !data) { toast.error("Errore apertura file"); return; }
    if (mode === "preview") {
      window.open(data.signedUrl, "_blank", "noopener");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = a.nome_file;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  }

  const itemPad = compact ? "p-2" : "p-2.5";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            {title} ({data?.length ?? 0})
          </h3>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Allega documento
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Caricamento…</div>
      ) : !data?.length ? (
        <div className="text-xs text-muted-foreground italic px-1">Nessun allegato.</div>
      ) : (
        <ul className="divide-y border rounded-md">
          {data.map((a) => {
            const canDelete = canManageAll || a.caricato_da === user?.id;
            const previewable = isPreviewable(a.mime_type);
            return (
              <li key={a.id} className={cn("flex items-center gap-3 text-sm", itemPad)}>
                <div className="text-muted-foreground">{iconFor(a.mime_type)}</div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => openSigned(a, previewable ? "preview" : "download")}
                    className="text-primary hover:underline truncate block text-left w-full"
                    title={a.nome_file}
                  >
                    {a.nome_file}
                  </button>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span>{fmtBytes(a.dimensione_bytes)}</span>
                    <span>·</span>
                    <span>{fmtDate(a.created_at)}</span>
                  </div>
                  {a.descrizione && (
                    <div className="text-xs text-muted-foreground mt-0.5">{a.descrizione}</div>
                  )}
                </div>
                {previewable && (
                  <Button size="icon" variant="ghost" onClick={() => openSigned(a, "preview")} title="Anteprima">
                    <Eye className="size-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => openSigned(a, "download")} title="Scarica">
                  <Download className="size-4" />
                </Button>
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setToDelete(a)}
                    title="Elimina"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <UploadDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          entitaTipo={entitaTipo}
          entitaId={entitaId}
          clienteId={clienteId}
          userId={user?.id}
          onUploaded={() => qc.invalidateQueries({ queryKey: key })}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'allegato?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.nome_file}" verrà eliminato definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && del.mutate(toDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadDialog({
  open, onOpenChange, entitaTipo, entitaId, clienteId, userId, onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entitaTipo: AllegatoEntitaTipo;
  entitaId: string;
  clienteId: string;
  userId: string | undefined;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [descrizione, setDescrizione] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setDescrizione("");
    setError(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const validate = (f: File): string | null => {
    if (f.size > ALLEGATI_MAX_BYTES) {
      return `File troppo grande (max ${ALLEGATI_MAX_BYTES / 1024 / 1024} MB)`;
    }
    if (f.type && !ALLEGATI_ALLOWED_MIMES.has(f.type)) {
      return `Tipo file non consentito: ${f.type}`;
    }
    return null;
  };

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    const err = validate(f);
    if (err) { setError(err); setFile(null); return; }
    setFile(f);
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Nessun file selezionato");
      if (!userId) throw new Error("Utente non autenticato");
      const uid = crypto.randomUUID();
      const path = `${entitaTipo}/${entitaId}/${uid}-${sanitize(file.name)}`;
      const { error: eUp } = await supabase.storage
        .from(ALLEGATI_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (eUp) throw eUp;
      const { error: eIns } = await supabase.from("allegati").insert({
        entita_tipo: entitaTipo,
        entita_id: entitaId,
        cliente_id: clienteId,
        nome_file: file.name,
        storage_path: path,
        mime_type: file.type || null,
        dimensione_bytes: file.size,
        descrizione: descrizione.trim() || null,
        caricato_da: userId,
      });
      if (eIns) {
        await supabase.storage.from(ALLEGATI_BUCKET).remove([path]);
        throw eIns;
      }
    },
    onSuccess: () => {
      toast.success("Allegato caricato");
      onUploaded();
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && upload.isPending) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allega documento</DialogTitle>
          <DialogDescription>
            Aggiungi un documento — PDF, Word, Excel, JPG, PNG — max 20MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) pickFile(f);
            }}
            className={cn(
              "border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-input bg-muted/30 hover:bg-muted/50",
            )}
            role="button"
            tabIndex={0}
          >
            <UploadCloud className="mx-auto size-8 text-muted-foreground mb-2" />
            {file ? (
              <div className="text-sm">
                <div className="font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtBytes(file.size)}</div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Trascina un file</span> o clicca per sfogliare
              </div>
            )}
            <Input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              disabled={upload.isPending}
            />
          </div>

          <Textarea
            placeholder="Descrizione (opzionale)"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={upload.isPending}
          />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={upload.isPending}
          >
            Annulla
          </Button>
          <Button
            onClick={() => upload.mutate()}
            disabled={!file || upload.isPending}
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Allega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
