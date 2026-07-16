import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlarmClock, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { notifyRichiestaEvento } from "@/lib/richieste-email.functions";


type Msg = {
  id: string;
  mittente_id: string | null;
  mittente_name: string;
  mittente_ruolo: string;
  destinatario: string;
  testo: string;
  tipo: string;
  letto_da: string[] | null;
  created_at: string;
};

const DEST_LABEL: Record<string, string> = {
  richiedente: "Richiedente",
  resp_generale: "Resp. Generale",
  direzione: "Direzione",
  amministrativo: "Amministrativo",
  tutti: "Tutti",
};

const RUOLO_LABEL: Record<string, string> = {
  richiedente: "Richiedente",
  resp_generale: "Resp. Generale",
  direzione: "Direzione",
  amministrativo: "Amministrativo",
};

const fmtDataOra = (v: string) =>
  new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function ruoloPrincipale(roles: string[]): "direzione" | "resp_generale" | "amministrativo" | "richiedente" {
  if (roles.includes("approvatore_richieste_liv2")) return "direzione";
  if (roles.includes("approvatore_richieste_liv1")) return "resp_generale";
  if (roles.includes("gestore_richieste") || roles.includes("esecutore_richieste")) return "amministrativo";
  return "richiedente";
}

// Destinatario del sollecito in base allo stato (chi sta facendo aspettare).
function destSollecitoPerStato(status?: string | null): "resp_generale" | "direzione" | null {
  if (status === "pending") return "resp_generale";
  if (status === "forwarded") return "direzione";
  return null;
}

export function ChatMessaggi({
  richiestaId,
  disabled,
  status,
  archived,
}: {
  richiestaId: string;
  disabled?: boolean;
  status?: string | null;
  archived?: boolean;
}) {
  const { user, profilo, roles } = useAuth();
  const uid = user?.id ?? "";
  const fullName = [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ").trim() || (user?.email ?? "");
  const qc = useQueryClient();

  const { data: messaggi, isLoading } = useQuery({
    queryKey: ["richiesta-interna-messaggi", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_interne_messaggi")
        .select("*")
        .eq("request_id", richiestaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  // Marca "letti" atomicamente all'apertura e quando cambia l'elenco.
  useEffect(() => {
    if (!uid || !richiestaId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("marca_messaggi_letti", { _richiesta_id: richiestaId });
      if (cancelled) return;
      if (!error && typeof data === "number" && data > 0) {
        qc.invalidateQueries({ queryKey: ["richiesta-interna-messaggi", richiestaId] });
        qc.invalidateQueries({ queryKey: ["richieste-interne", "non-lette"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, richiestaId, messaggi?.length, qc]);

  const [testo, setTesto] = useState("");
  const [destinatario, setDestinatario] = useState<string>("tutti");
  const [invio, setInvio] = useState(false);

  const mittenteRuolo = useMemo(() => ruoloPrincipale(roles as string[]), [roles]);

  // Sollecito
  const destSollecito = destSollecitoPerStato(status);
  const canSollecitare = !!destSollecito && !archived && !disabled;
  const [sollecitoOpen, setSollecitoOpen] = useState(false);
  const [sollecitoNota, setSollecitoNota] = useState("");
  const [inviaSoll, setInviaSoll] = useState(false);

  async function invia() {
    const t = testo.trim();
    if (!t) return;
    setInvio(true);
    const { error } = await supabase.from("richieste_interne_messaggi").insert({
      request_id: richiestaId,
      mittente_id: uid,
      mittente_name: fullName,
      mittente_ruolo: mittenteRuolo,
      destinatario,
      testo: t,
      tipo: "messaggio",
      letto_da: [uid],
    });
    setInvio(false);
    if (error) {
      toast.error("Errore invio: " + error.message);
      return;
    }
    // Strato 5: accoda notifica su Inngest (non blocca mai l'azione)
    try {
      const res = await notifyRichiestaEvento({
        data: {
          event: "messaggio_interno",
          richiestaId,
          actor: { id: uid, nome: fullName, email: user?.email ?? null },
          extra: { by: fullName, dest: destinatario, testo: t },
        },
      });
      if (!res.ok) console.warn("[notifica messaggio_interno] enqueue fallito:", res.err);
    } catch (e) {
      console.error("[email messaggio_interno] fallito:", e);
    }

    setTesto("");
    toast.success("Messaggio inviato");
    qc.invalidateQueries({ queryKey: ["richiesta-interna-messaggi", richiestaId] });
    qc.invalidateQueries({ queryKey: ["richieste-interne", "non-lette"] });
  }

  async function inviaSollecito() {
    if (!destSollecito) return;
    const nota = sollecitoNota.trim() || "Sollecito di approvazione";
    setInviaSoll(true);
    const { error } = await supabase.from("richieste_interne_messaggi").insert({
      request_id: richiestaId,
      mittente_id: uid,
      mittente_name: fullName,
      mittente_ruolo: mittenteRuolo,
      destinatario: destSollecito,
      testo: nota,
      tipo: "sollecito",
      letto_da: [uid],
    });
    setInviaSoll(false);
    if (error) {
      toast.error("Errore sollecito: " + error.message);
      return;
    }
    try {
      const res = await notifyRichiestaEvento({
        data: {
          event: "sollecito",
          richiestaId,
          actor: { id: uid, nome: fullName, email: user?.email ?? null },
          extra: { by: fullName, dest: destSollecito, nota },
        },
      });
      if (!res.ok) console.warn("[notifica sollecito] enqueue fallito:", res.err);
    } catch (e) {
      console.error("[email sollecito] fallito:", e);
    }
    setSollecitoNota("");
    setSollecitoOpen(false);
    toast.success("Sollecito inviato");
    qc.invalidateQueries({ queryKey: ["richiesta-interna-messaggi", richiestaId] });
    qc.invalidateQueries({ queryKey: ["richieste-interne", "non-lette"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <MessageSquare className="size-4" />
          Messaggi{messaggi?.length ? ` (${messaggi.length})` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            <Loader2 className="size-4 inline animate-spin mr-1" />Caricamento…
          </div>
        ) : !messaggi || messaggi.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">Nessun messaggio</div>
        ) : (
          <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {messaggi.map((m) => {
              const mine = m.mittente_id === uid;
              const isSollecito = m.tipo === "sollecito";
              return (
                <li
                  key={m.id}
                  className={`rounded-md border p-3 ${
                    isSollecito
                      ? "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700"
                      : mine
                        ? "bg-primary/10 border-primary/30 ml-8"
                        : "bg-muted/40 mr-8"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                    <div className="inline-flex items-center gap-2 flex-wrap">
                      {isSollecito && <AlarmClock className="size-3.5 text-amber-600" />}
                      <span className="font-medium text-foreground">{m.mittente_name}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {RUOLO_LABEL[m.mittente_ruolo] ?? m.mittente_ruolo}
                      </Badge>
                      <span>→</span>
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                        {DEST_LABEL[m.destinatario] ?? m.destinatario}
                      </Badge>
                    </div>
                    <span>{fmtDataOra(m.created_at)}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.testo}</div>
                </li>
              );
            })}
          </ul>
        )}

        {!disabled && (
          <div className="space-y-2 border-t pt-3">
            <Textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder="Scrivi un messaggio…"
              rows={3}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-muted-foreground">A:</div>
              <Select value={destinatario} onValueChange={setDestinatario}>
                <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti i coinvolti</SelectItem>
                  <SelectItem value="richiedente">Richiedente</SelectItem>
                  <SelectItem value="resp_generale">Resp. Generale</SelectItem>
                  <SelectItem value="direzione">Direzione</SelectItem>
                  <SelectItem value="amministrativo">Amministrativo</SelectItem>
                </SelectContent>
              </Select>
              {canSollecitare && (
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
                  onClick={() => setSollecitoOpen(true)}
                >
                  <AlarmClock className="size-4 mr-1" />
                  Sollecita
                </Button>
              )}
              <Button className={canSollecitare ? "" : "ml-auto"} onClick={invia} disabled={invio || !testo.trim()}>
                {invio ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                Invia
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={sollecitoOpen} onOpenChange={setSollecitoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <AlarmClock className="size-4 text-amber-600" />
              Invia sollecito
            </DialogTitle>
            <DialogDescription>
              Verrà sollecitato:{" "}
              <span className="font-medium text-foreground">
                {destSollecito ? DEST_LABEL[destSollecito] : "—"}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={sollecitoNota}
              onChange={(e) => setSollecitoNota(e.target.value)}
              placeholder="Aggiungi una nota per il sollecito… (facoltativo)"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSollecitoOpen(false)} disabled={inviaSoll}>
              Annulla
            </Button>
            <Button onClick={inviaSollecito} disabled={inviaSoll || !destSollecito}>
              {inviaSoll ? <Loader2 className="size-4 mr-1 animate-spin" /> : <AlarmClock className="size-4 mr-1" />}
              Invia sollecito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
