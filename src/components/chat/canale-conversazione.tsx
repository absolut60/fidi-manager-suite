import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Paperclip, Search, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Allegato = {
  id: string;
  nome_file: string;
  storage_path: string;
  mime_type: string | null;
  dimensione_bytes: number | null;
};

type Messaggio = {
  id: string;
  canale_id: string;
  autore_id: string;
  testo: string;
  created_at: string;
  eliminato_at?: string | null;
  allegato?: Allegato | null;
};

const BUCKET = "allegati";

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(b: number | null) {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function scaricaFile(path: string, nomeFile: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error("Impossibile scaricare il file");
    return;
  }
  try {
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Impossibile scaricare il file");
  }
}

function AllegatoMessaggio({ allegato }: { allegato: Allegato }) {
  const isImg = (allegato.mime_type ?? "").startsWith("image/");
  const isPdf = allegato.mime_type === "application/pdf";
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isImg) return;
    let active = true;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(allegato.storage_path, 60);
      if (active) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      active = false;
    };
  }, [allegato.storage_path, isImg]);

  async function apriInScheda() {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(allegato.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Impossibile aprire il file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (isImg) {
    return (
      <>
        {url ? (
          <img
            src={url}
            alt={allegato.nome_file}
            onClick={() => setOpen(true)}
            className="mt-2 max-w-[200px] rounded-md cursor-pointer"
          />
        ) : (
          <div className="mt-2 h-24 w-[200px] rounded-md bg-background/30 animate-pulse" />
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-4xl">
            {url && <img src={url} alt={allegato.nome_file} className="w-full h-auto rounded-md" />}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-foreground">
      <button
        type="button"
        onClick={() => scaricaFile(allegato.storage_path, allegato.nome_file)}
        className="flex items-center gap-2 min-w-0 text-left"
      >
        <FileText className="size-4 shrink-0" />
        <span className="text-xs truncate max-w-[160px]">{allegato.nome_file}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatBytes(allegato.dimensione_bytes)}
        </span>
      </button>
      {isPdf && (
        <button type="button" onClick={apriInScheda} className="shrink-0" title="Apri">
          <Search className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function CanaleConversazione({ canaleId }: { canaleId: string }) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("amministratore");
  const instanceId = useId();
  const [messaggioDaEliminare, setMessaggioDaEliminare] = useState<Messaggio | null>(null);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const [fileSelezionato, setFileSelezionato] = useState<File | null>(null);
  const [previewLocale, setPreviewLocale] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: profili } = useQuery({
    queryKey: ["chat", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profili").select("id, nome, cognome, attivo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nomeAutore = useMemo(() => {
    const map = new Map<string, string>();
    (profili ?? []).forEach((p) => {
      const label = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
      map.set(p.id, label || "—");
    });
    return map;
  }, [profili]);

  useEffect(() => {
    if (!fileSelezionato || !fileSelezionato.type.startsWith("image/")) {
      setPreviewLocale(null);
      return;
    }
    const url = URL.createObjectURL(fileSelezionato);
    setPreviewLocale(url);
    return () => URL.revokeObjectURL(url);
  }, [fileSelezionato]);

  useEffect(() => {
    if (!canaleId) {
      setMessaggi([]);
      return;
    }
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("messaggi")
        .select("id, canale_id, autore_id, testo, created_at, eliminato_at")
        .eq("canale_id", canaleId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        toast.error("Errore nel caricamento dei messaggi");
        return;
      }
      const lista = (data ?? []) as Messaggio[];
      if (lista.length > 0) {
        const { data: alleg } = await supabase
          .from("allegati")
          .select("id, entita_id, nome_file, storage_path, mime_type, dimensione_bytes")
          .eq("entita_tipo", "messaggio")
          .in("entita_id", lista.map((m) => m.id));
        const mappa = new Map<string, Allegato>();
        (alleg ?? []).forEach((a) => {
          if (!mappa.has(a.entita_id)) {
            mappa.set(a.entita_id, {
              id: a.id,
              nome_file: a.nome_file,
              storage_path: a.storage_path,
              mime_type: a.mime_type,
              dimensione_bytes: a.dimensione_bytes,
            });
          }
        });
        lista.forEach((m) => {
          m.allegato = mappa.get(m.id) ?? null;
        });
      }
      if (active) setMessaggi(lista);
    };
    load();

    if (typeof window === "undefined") return;

    // Topic unico per istanza: altrimenti supabase-js riusa il channel e `.on()` rompe la pagina.
    const channel = supabase
      .channel(`messaggi-${canaleId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messaggi",
          filter: `canale_id=eq.${canaleId}`,
        },
        (payload) => {
          const nuovo = payload.new as Messaggio;
          if (!nuovo?.id) return;
          setMessaggi((prev) => {
            const esistente = prev.find((m) => m.id === nuovo.id);
            if (esistente) {
              return prev.map((m) =>
                m.id === nuovo.id
                  ? { ...m, ...nuovo, allegato: m.allegato ?? nuovo.allegato }
                  : m
              );
            }
            return [...prev, nuovo];
          });
          void (async () => {
            const { data: alleg } = await supabase
              .from("allegati")
              .select("id, entita_id, nome_file, storage_path, mime_type, dimensione_bytes")
              .eq("entita_tipo", "messaggio")
              .eq("entita_id", nuovo.id)
              .limit(1);
            const a = (alleg ?? [])[0];
            if (!a) return;
            const allegatoTrovato: Allegato = {
              id: a.id,
              nome_file: a.nome_file,
              storage_path: a.storage_path,
              mime_type: a.mime_type,
              dimensione_bytes: a.dimensione_bytes,
            };
            setMessaggi((prev) =>
              prev.map((m) =>
                m.id === nuovo.id ? { ...m, allegato: m.allegato ?? allegatoTrovato } : m
              )
            );
          })();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [canaleId, instanceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messaggi.length, canaleId]);

  async function inviaMessaggio() {
    const t = testo.trim();
    const file = fileSelezionato;
    if ((!t && !file) || !canaleId || invio) return;
    setInvio(true);
    const { data, error } = await supabase
      .from("messaggi")
      .insert({ canale_id: canaleId, testo: t || "" })
      .select("id, canale_id, autore_id, testo, created_at")
      .single();
    if (error || !data) {
      setInvio(false);
      toast.error("Impossibile inviare il messaggio");
      return;
    }
    const nuovo = data as Messaggio;

    if (file) {
      const path = `messaggio/${nuovo.id}/${Date.now()}_${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        toast.error("Messaggio inviato ma allegato non caricato");
      } else {
        const { data: row, error: insErr } = await supabase
          .from("allegati")
          .insert({
            entita_tipo: "messaggio",
            entita_id: nuovo.id,
            cliente_id: null,
            nome_file: file.name,
            storage_path: path,
            mime_type: file.type || null,
            dimensione_bytes: file.size,
            caricato_da: user?.id ?? null,
          })
          .select("id, nome_file, storage_path, mime_type, dimensione_bytes")
          .single();
        if (insErr || !row) {
          toast.error("Messaggio inviato ma allegato non caricato");
        } else {
          nuovo.allegato = row as Allegato;
        }
      }
    }

    setInvio(false);
    setTesto("");
    setFileSelezionato(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessaggi((prev) => {
      const esistente = prev.find((m) => m.id === nuovo.id);
      if (esistente) {
        return prev.map((m) =>
          m.id === nuovo.id ? { ...m, ...nuovo, allegato: nuovo.allegato ?? m.allegato } : m
        );
      }
      return [...prev, nuovo];
    });
  }

  async function eliminaMessaggio(m: Messaggio) {
    if (m.allegato) {
      const { error: sErr } = await supabase.storage.from(BUCKET).remove([m.allegato.storage_path]);
      if (sErr) console.warn("[chat] rimozione file allegato fallita", sErr);
      await supabase.from("allegati").delete().eq("id", m.allegato.id);
    }
    const { error } = await supabase
      .from("messaggi")
      .update({ eliminato_at: new Date().toISOString() })
      .eq("id", m.id);
    if (error) {
      toast.error("Impossibile eliminare il messaggio");
      return;
    }
    setMessaggi((prev) =>
      prev.map((x) =>
        x.id === m.id ? { ...x, eliminato_at: new Date().toISOString(), allegato: null } : x
      )
    );
    toast.success("Messaggio eliminato");
  }

  const puoInviare = !!testo.trim() || !!fileSelezionato;

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 max-h-[55vh]">
        <div className="p-4 space-y-3">
          {messaggi.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nessun messaggio. Scrivi il primo!
            </div>
          )}
          {messaggi.map((m) => {
            const mio = m.autore_id === user?.id;
            const eliminato = !!m.eliminato_at;
            const puoEliminare = !eliminato && (mio || isAdmin);
            return (
              <div key={m.id} className={`group flex items-center gap-1 ${mio ? "justify-end" : "justify-start"}`}>
                {mio && puoEliminare && (
                  <button
                    type="button"
                    aria-label="Elimina messaggio"
                    title="Elimina messaggio"
                    onClick={() => setMessaggioDaEliminare(m)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    mio ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {!mio && (
                    <div className="text-[11px] font-semibold mb-0.5">
                      {nomeAutore.get(m.autore_id) ?? "—"}
                    </div>
                  )}
                  {eliminato ? (
                    <div className="text-sm italic text-muted-foreground">Messaggio eliminato</div>
                  ) : (
                    <>
                      {m.testo && (
                        <div className="text-sm whitespace-pre-wrap break-words">{m.testo}</div>
                      )}
                      {m.allegato && <AllegatoMessaggio allegato={m.allegato} />}
                    </>
                  )}
                  <div
                    className={`text-[10px] mt-1 ${
                      mio ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {formatDistanceToNow(new Date(m.created_at), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {fileSelezionato && (
        <div className="border-t px-3 pt-2">
          <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1.5">
            {previewLocale ? (
              <img src={previewLocale} alt="" className="size-10 rounded object-cover" />
            ) : (
              <FileText className="size-4" />
            )}
            <span className="text-xs truncate max-w-[180px]">{fileSelezionato.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatBytes(fileSelezionato.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                setFileSelezionato(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Rimuovi allegato"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="border-t p-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileSelezionato(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Allega file"
        >
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (puoInviare) inviaMessaggio();
            }
          }}
          placeholder="Scrivi un messaggio…"
          rows={2}
          className="resize-none"
        />
        <Button onClick={inviaMessaggio} disabled={!puoInviare || invio} size="icon">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
