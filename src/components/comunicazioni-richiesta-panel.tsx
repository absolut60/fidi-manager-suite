import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  inviaComunicazioneRichiesta,
  DESTINATARIO_LABEL,
  type DestinatarioComunicazione,
} from "@/lib/comunicazioni-richiesta";

interface Props {
  richiestaId: string;
  richiestaCreatedBy: string;
}

function iniziali(nome?: string | null, cognome?: string | null): string {
  const n = (nome ?? "").trim();
  const c = (cognome ?? "").trim();
  return ((n[0] ?? "") + (c[0] ?? "")).toUpperCase() || "?";
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function ComunicazioniRichiestaPanel({ richiestaId, richiestaCreatedBy }: Props) {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [destinatario, setDestinatario] = useState<DestinatarioComunicazione>("approvatore");
  const [testo, setTesto] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const canModerate = roles.includes("amministratore") || roles.includes("amministrazione");

  const { data: messaggi, isLoading } = useQuery({
    queryKey: ["comunicazioni", richiestaId],
    enabled: !!user?.id && !!richiestaId,
    queryFn: async () => {
      const { data: comunicazioni, error } = await supabase
        .from("comunicazioni_richiesta")
        .select("id, richiesta_id, autore_id, destinatario, testo, created_at, letto_da")
        .eq("richiesta_id", richiestaId)
        .order("created_at", { ascending: true });
      console.log("[ComunicazioniRichiestaPanel] richiestaId", richiestaId, "righe", comunicazioni?.length ?? 0, "errore", error);
      if (error) throw error;

      const rows = comunicazioni ?? [];
      const autoreIds = Array.from(new Set(rows.map((m) => m.autore_id).filter(Boolean)));
      if (autoreIds.length === 0) return rows.map((m) => ({ ...m, autore: null }));

      const { data: profili, error: profiliError } = await supabase
        .from("profili")
        .select("id, nome, cognome, email")
        .in("id", autoreIds);
      console.log("[ComunicazioniRichiestaPanel] profili", profili?.length ?? 0, "errore", profiliError);

      const profiliById = new Map((profili ?? []).map((p: any) => [p.id, p]));
      return rows.map((m) => ({ ...m, autore: profiliById.get(m.autore_id) ?? null }));
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non autenticato");
      return inviaComunicazioneRichiesta({
        richiestaId,
        destinatario,
        testo,
        autoreId: user.id,
        autoreEmail: user.email,
      });
    },
    onSuccess: () => {
      setTesto("");
      qc.invalidateQueries({ queryKey: ["comunicazioni", richiestaId] });
      qc.invalidateQueries({ queryKey: ["msg-non-letti-richieste"] });
      qc.invalidateQueries({ queryKey: ["comunicazioni-non-lette"] });
      toast.success("Messaggio inviato");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Errore invio messaggio");
    },
  });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="size-5 text-primary" />
        <h2 className="font-semibold">Comunicazioni</h2>
      </div>

      <div className="space-y-3 mb-5">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !messaggi || messaggi.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nessun messaggio ancora. Scrivi il primo qui sotto.</p>
        ) : (
          messaggi.map((m: any) => {
            const a = m.autore;
            const isRichiedente = m.autore_id === richiestaCreatedBy;
            const ruoloLabel = isRichiedente ? "RICHIEDENTE" : "APPROVATORE";
            const isMine = m.autore_id === user?.id;
            return (
              <div key={m.id} className="flex items-start gap-3">
                <div
                  className={cn(
                    "size-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0",
                    isRichiedente ? "bg-blue-600" : "bg-emerald-600",
                  )}
                >
                  {iniziali(a?.nome, a?.cognome)}
                </div>
                <div className={cn("flex-1 rounded-lg border p-3", isMine ? "bg-accent/40" : "bg-card")}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">
                      {[a?.nome, a?.cognome].filter(Boolean).join(" ") || "Utente"}
                    </span>
                    <Badge variant="secondary" className="text-[10px] py-0 h-4">
                      {ruoloLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      → a {DESTINATARIO_LABEL[m.destinatario as DestinatarioComunicazione] ?? m.destinatario}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{formatTs(m.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.testo}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Destinatario:</span>
          {(["richiedente", "approvatore", "tutti"] as DestinatarioComunicazione[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDestinatario(d)}
              className={cn(
                "text-xs px-3 py-1 rounded-full border transition",
                destinatario === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent",
              )}
            >
              {DESTINATARIO_LABEL[d]}
            </button>
          ))}
        </div>
        <Textarea
          placeholder="Scrivi un messaggio..."
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!testo.trim() || sendMutation.isPending}
            size="sm"
          >
            <Send className="size-4 mr-1" />
            {sendMutation.isPending ? "Invio..." : "Invia messaggio"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
