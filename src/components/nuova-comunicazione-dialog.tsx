import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  inviaComunicazioneRichiesta,
  DESTINATARIO_LABEL,
  type DestinatarioComunicazione,
} from "@/lib/comunicazioni-richiesta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  richiestaId: string;
  clienteRagioneSociale?: string | null;
  /** Destinatario suggerito quando il dialog si apre (es. da pulsante "Richiedi integrazioni" => "richiedente") */
  defaultDestinatario?: DestinatarioComunicazione;
  /** Testo iniziale opzionale */
  defaultTesto?: string;
  onSent?: () => void;
}

const TUTTI_DEST: DestinatarioComunicazione[] = ["richiedente", "approvatore", "tutti"];

export function NuovaComunicazioneDialog({
  open, onOpenChange, richiestaId, clienteRagioneSociale,
  defaultDestinatario = "approvatore", defaultTesto = "", onSent,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [destinatario, setDestinatario] = useState<DestinatarioComunicazione>(defaultDestinatario);
  const [testo, setTesto] = useState(defaultTesto);

  // Reset quando il dialog si riapre
  useEffect(() => {
    if (open) {
      setDestinatario(defaultDestinatario);
      setTesto(defaultTesto);
    }
  }, [open, defaultDestinatario, defaultTesto]);

  const sendMut = useMutation({
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
      toast.success("Messaggio inviato");
      qc.invalidateQueries({ queryKey: ["comunicazioni", richiestaId] });
      qc.invalidateQueries({ queryKey: ["msg-non-letti-richieste"] });
      qc.invalidateQueries({ queryKey: ["comunicazioni-non-lette"] });
      setTesto("");
      onOpenChange(false);
      onSent?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !sendMut.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova comunicazione</DialogTitle>
          <DialogDescription>
            {clienteRagioneSociale ? (
              <>Richiesta fido di <strong>{clienteRagioneSociale}</strong></>
            ) : (
              <>Invia un messaggio collegato alla richiesta. Verrà salvato nello storico e arriverà via email + alert in-app al destinatario.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Destinatario</p>
            <div className="flex flex-wrap items-center gap-2">
              {TUTTI_DEST.map((d) => (
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
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Messaggio</p>
            <Textarea
              autoFocus
              rows={5}
              placeholder={
                destinatario === "richiedente"
                  ? "Es. servono integrazioni: bilancio aggiornato, ultimo bilancio..."
                  : destinatario === "approvatore"
                  ? "Scrivi un messaggio agli approvatori..."
                  : "Scrivi un messaggio a richiedente e approvatori..."
              }
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendMut.isPending}>
            Annulla
          </Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={!testo.trim() || sendMut.isPending}
          >
            <Send className="size-4 mr-1" />
            {sendMut.isPending ? "Invio..." : "Invia messaggio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
