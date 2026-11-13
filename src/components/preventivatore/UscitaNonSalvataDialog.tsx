import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { StatoSalvataggio } from "@/lib/use-stato-salvataggio-preventivo";

const TESTI: Partial<Record<StatoSalvataggio, string>> = {
  modifiche: "Hai una casella modificata non ancora salvata.",
  salvataggio: "Il salvataggio è ancora in corso.",
  errore: "L'ultimo salvataggio non è riuscito.",
};

/** FM65 B3: finestra d'uscita dalla scheda preventivo; lo stato viene solo da useStatoSalvataggioPreventivo. */
export function UscitaNonSalvataDialog({ open, stato, salvaOra, onEsci, onResta }: {
  open: boolean;
  stato: StatoSalvataggio;
  salvaOra: () => Promise<boolean>;
  onEsci: () => void;
  onResta: () => void;
}) {
  const [attesa, setAttesa] = useState(false);
  const salvaEdEsci = async () => {
    setAttesa(true);
    try {
      const ok = await salvaOra();
      if (ok) onEsci();
      else { toast.error("Salvataggio non riuscito: controlla e riprova"); onResta(); }
    } finally { setAttesa(false); }
  };
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !attesa) onResta(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
          <AlertDialogDescription>{TESTI[stato] ?? ""}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <Button variant="outline" className="w-full text-destructive hover:text-destructive sm:w-auto" disabled={attesa} onClick={onEsci}>
            Esci senza salvare
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" disabled={attesa} onClick={onResta}>
            Resta qui
          </Button>
          <Button className="w-full sm:w-auto" disabled={attesa} onClick={salvaEdEsci}>
            {attesa && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {attesa ? "Salvataggio…" : "Salva ed esci"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
