// Pulsante "Elimina" con doppia conferma (click → AlertDialog → conferma esplicita).
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function BottoneElimina({
  titolo,
  descrizione,
  onConferma,
  etichetta,
  variant = "ghost",
  size = "icon",
  className,
}: {
  titolo: string;
  descrizione: string;
  onConferma: () => Promise<void> | void;
  /** Se presente mostra il testo accanto all'icona. */
  etichetta?: string;
  variant?: "ghost" | "outline" | "destructive";
  size?: "icon" | "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function conferma() {
    setBusy(true);
    try {
      await onConferma();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={etichetta ? (size === "icon" ? "sm" : size) : size}
        title="Elimina"
        className={className ?? (variant === "ghost" ? "text-destructive hover:text-destructive" : undefined)}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        {etichetta ? <span className="ml-1.5">{etichetta}</span> : null}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titolo}</AlertDialogTitle>
            <AlertDialogDescription>{descrizione}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void conferma(); }}
            >
              {busy ? "Eliminazione…" : "Elimina definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
