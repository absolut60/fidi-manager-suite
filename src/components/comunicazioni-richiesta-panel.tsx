import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { sendNotificaComunicazione } from "@/lib/send-email";

type Destinatario = "richiedente" | "approvatore" | "tutti";

interface Props {
  richiestaId: string;
  richiestaCreatedBy: string;
}

const DESTINATARIO_LABEL: Record<Destinatario, string> = {
  richiedente: "Richiedente",
  approvatore: "Approvatore",
  tutti: "Tutti",
};

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
  const { user } = useAuth();
  const qc = useQueryClient();
  const [destinatario, setDestinatario] = useState<Destinatario>("approvatore");
  const [testo, setTesto] = useState("");

  const { data: messaggi, isLoading } = useQuery({
    queryKey: ["comunicazioni", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicazioni_richiesta")
        .select("*, autore:profili(nome, cognome, email)")
        .eq("richiesta_id", richiestaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non autenticato");
      const testoTrim = testo.trim();
      if (!testoTrim) throw new Error("Testo vuoto");

      const { error } = await supabase.from("comunicazioni_richiesta").insert({
        richiesta_id: richiestaId,
        autore_id: user.id,
        destinatario,
        testo: testoTrim,
      });
      if (error) throw error;

      // Recupera profilo autore + destinatari per email
      const { data: meProfilo } = await supabase
        .from("profili")
        .select("nome, cognome")
        .eq("id", user.id)
        .maybeSingle();
      const autoreNome = [meProfilo?.nome, meProfilo?.cognome].filter(Boolean).join(" ") || "Un utente";

      // Determina destinatari email
      const destinatariEmail: { email: string; nome: string }[] = [];

      if (destinatario === "richiedente" || destinatario === "tutti") {
        const { data: richProf } = await supabase
          .from("profili")
          .select("nome, cognome, email")
          .eq("id", richiestaCreatedBy)
          .maybeSingle();
        if (richProf?.email && richProf.email !== user.email) {
          destinatariEmail.push({
            email: richProf.email,
            nome: [richProf.nome, richProf.cognome].filter(Boolean).join(" ") || "Richiedente",
          });
        }
      }

      if (destinatario === "approvatore" || destinatario === "tutti") {
        // Approvatori = chi ha già approvato la richiesta
        const { data: appr } = await supabase
          .from("approvazioni")
          .select("approvatore_id")
          .eq("richiesta_id", richiestaId);
        const ids = Array.from(new Set((appr ?? []).map((a) => a.approvatore_id))).filter(
          (id) => id !== user.id,
        );
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profili")
            .select("id, nome, cognome, email")
            .in("id", ids);
          for (const p of profs ?? []) {
            if (p.email) {
              destinatariEmail.push({
                email: p.email,
                nome: [p.nome, p.cognome].filter(Boolean).join(" ") || "Approvatore",
              });
            }
          }
        }
      }

      // Invia email (non bloccante)
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      for (const d of destinatariEmail) {
        sendNotificaComunicazione({
          toEmail: d.email,
          toName: d.nome,
          autoreNome,
          richiestaId,
          testo: testoTrim,
          appUrl,
        }).catch((e) => console.error("Errore notifica email:", e));
      }
    },
    onSuccess: () => {
      setTesto("");
      qc.invalidateQueries({ queryKey: ["comunicazioni", richiestaId] });
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
                      → a {DESTINATARIO_LABEL[m.destinatario as Destinatario] ?? m.destinatario}
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
          {(["richiedente", "approvatore", "tutti"] as Destinatario[]).map((d) => (
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
