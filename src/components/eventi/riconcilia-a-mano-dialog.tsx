import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, X } from "lucide-react";
import { toast } from "sonner";
import { riconciliaPartecipante } from "@/lib/firma-privacy.functions";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function messaggioErrore(errore: unknown): string {
  switch (errore) {
    case "non_autorizzato":
      return "Non hai i permessi per riconciliare";
    case "non_trovato":
      return "Partecipante non trovato";
    case "gia_riconciliato":
      return "Partecipante già riconciliato";
    case "cliente_non_trovato":
      return "Cliente non trovato";
    case "match_non_univoco":
      return "Riconciliazione non riuscita";
    default:
      return "Riconciliazione non riuscita";
  }
}

export function RiconciliaAManoDialog({
  partecipanteId,
  etichetta,
  eventoId,
}: {
  partecipanteId: string;
  etichetta: string;
  eventoId: string;
}) {
  const [open, setOpen] = useState(false);
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const queryClient = useQueryClient();
  const riconciliaFn = useServerFn(riconciliaPartecipante);

  const resetta = () => {
    setSoggetto(null);
    setOpen(false);
  };

  const seleziona = (s: SoggettoSelezionato) => {
    if (s.tipo !== "cliente") {
      toast.error("Seleziona un cliente");
      return;
    }
    setSoggetto(s);
  };

  const onConferma = async () => {
    if (!soggetto) return;
    setInCorso(true);
    try {
      const res = await riconciliaFn({
        data: { partecipanteId, clienteId: soggetto.id },
      });
      if (res.ok === true) {
        toast.success("Partecipante riconciliato");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] }),
          queryClient.invalidateQueries({ queryKey: ["eventi-lista"] }),
        ]);
        resetta();
      } else {
        toast.error(messaggioErrore(res.errore));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Riconciliazione non riuscita");
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : resetta())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
          <Link2 className="size-4" /> Riconcilia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Riconcilia &quot;{etichetta}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Scegli il cliente a cui collegare questo partecipante. La privacy raccolta verrà portata sul cliente.
        </p>
        {soggetto ? (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <Badge variant="default" className="shrink-0">Cliente</Badge>
            <span className="min-w-0 truncate text-sm font-medium">{soggetto.etichetta}</span>
            <Button
              size="icon" variant="ghost" className="ml-auto size-7 shrink-0"
              aria-label="Deseleziona cliente"
              onClick={() => setSoggetto(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <SoggettoCombobox onSelect={seleziona} placeholder="Cerca cliente…" autoFocus />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={resetta} disabled={inCorso}>
            Annulla
          </Button>
          <Button onClick={() => void onConferma()} disabled={!soggetto || inCorso}>
            {inCorso ? "Riconciliazione…" : "Riconcilia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
