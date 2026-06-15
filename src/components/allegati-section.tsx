import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Paperclip, Upload, Download, Trash2, Loader2, FileText, Image as ImageIcon, File as FileIcon,
} from "lucide-react";

export type AllegatoEntitaTipo =
  | "cliente"
  | "assicurazione"
  | "pratica_legale"
  | "azione_recupero";

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

export function AllegatiSection({
  entitaTipo, entitaId, clienteId, canEdit = true, title = "Allegati",
}: Props) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "amministratore";
  const inputRef = useRef<HTMLInputElement>(null);
  const [descrizione, setDescrizione] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
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

  const upload = useMutation({
    mutationFn: async ({ file, descr }: { file: File; descr: string }) => {
      if (file.size > ALLEGATI_MAX_BYTES) {
        throw new Error(`File troppo grande (max ${ALLEGATI_MAX_BYTES / 1024 / 1024} MB)`);
      }
      if (file.type && !ALLEGATI_ALLOWED_MIMES.has(file.type)) {
        throw new Error(`Tipo file non consentito: ${file.type}`);
      }
      if (!user?.id) throw new Error("Utente non autenticato");
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
        descrizione: descr.trim() || null,
        caricato_da: user.id,
      });
      if (eIns) {
        // Rollback file
        await supabase.storage.from(ALLEGATI_BUCKET).remove([path]);
        throw eIns;
      }
    },
    onSuccess: () => {
      toast.success("Allegato caricato");
      setDescrizione("");
      setPendingFile(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
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

  async function download(a: AllegatoRow) {
    const { data, error } = await supabase.storage
      .from(ALLEGATI_BUCKET)
      .createSignedUrl(a.storage_path, 60);
    if (error || !data) { toast.error("Errore download"); return; }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = a.nome_file;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title} {data ? `(${data.length})` : ""}</h3>
      </div>

      {canEdit && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <Input
            ref={inputRef}
            type="file"
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            disabled={upload.isPending}
          />
          <Textarea
            placeholder="Descrizione (opzionale)"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={upload.isPending}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Max 20 MB. PDF, immagini, Office, TXT/CSV.
            </span>
            <Button
              size="sm"
              onClick={() => pendingFile && upload.mutate({ file: pendingFile, descr: descrizione })}
              disabled={!pendingFile || upload.isPending}
            >
              {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Carica
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Caricamento…</div>
      ) : !data?.length ? (
        <div className="text-xs text-muted-foreground italic">Nessun allegato.</div>
      ) : (
        <ul className="divide-y border rounded-md">
          {data.map((a) => {
            const canDelete = canEdit && (isAdmin || a.caricato_da === user?.id);
            return (
              <li key={a.id} className="flex items-center gap-3 p-2.5 text-sm">
                <div className="text-muted-foreground">{iconFor(a.mime_type)}</div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => download(a)}
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
                <Button size="icon" variant="ghost" onClick={() => download(a)} title="Scarica">
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
