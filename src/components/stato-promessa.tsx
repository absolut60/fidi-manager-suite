// Fonte unica UI dello stato di una promessa di pagamento
// (azioni_recupero.stato_promessa). Usato da: pagina "Promesse di pagamento",
// timeline attività del cliente. Permesso: puoCambiareStatoPromessa (gemello del
// trigger trg_azioni_recupero_stato_promessa).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { puoCambiareStatoPromessa } from "@/lib/recupero-permessi";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type StatoPromessa = "attiva" | "mantenuta" | "disattesa" | "annullata";

export const STATI_PROMESSA: { value: StatoPromessa; label: string }[] = [
  { value: "attiva", label: "Attiva" },
  { value: "mantenuta", label: "Mantenuta" },
  { value: "disattesa", label: "Disattesa" },
  { value: "annullata", label: "Annullata" },
];

const CLS: Record<StatoPromessa, string> = {
  attiva: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  mantenuta: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30 dark:text-emerald-300",
  disattesa: "bg-destructive/15 text-destructive border-destructive/30",
  annullata: "bg-muted text-muted-foreground border-border",
};

export function labelStatoPromessa(s: string | null | undefined): string {
  return STATI_PROMESSA.find((x) => x.value === s)?.label ?? "Attiva";
}

export function BadgeStatoPromessa({ stato }: { stato: string | null | undefined }) {
  const s = (STATI_PROMESSA.some((x) => x.value === stato) ? stato : "attiva") as StatoPromessa;
  return (
    <Badge variant="outline" className={`shrink-0 ${CLS[s]}`}>
      Promessa {labelStatoPromessa(s).toLowerCase()}
    </Badge>
  );
}

/** Selettore con conferma per chi può; badge per tutti gli altri. */
export function SelettoreStatoPromessa({
  azioneId, clienteId, stato, onChanged, className,
}: {
  azioneId: string;
  clienteId: string;
  stato: string | null | undefined;
  onChanged?: () => void;
  className?: string;
}) {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<StatoPromessa | null>(null);
  const [saving, setSaving] = useState(false);
  const corrente = (stato ?? "attiva") as StatoPromessa;

  if (!puoCambiareStatoPromessa(roles)) return <BadgeStatoPromessa stato={corrente} />;

  async function conferma() {
    if (!pending) return;
    setSaving(true);
    const { error } = await supabase
      .from("azioni_recupero")
      .update({ stato_promessa: pending } as never)
      .eq("id", azioneId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Promessa segnata come ${labelStatoPromessa(pending).toLowerCase()}`);
    setPending(null);
    qc.invalidateQueries({ queryKey: ["promesse-pagamento"] });
    qc.invalidateQueries({ queryKey: ["promesse-previsione"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
    onChanged?.();
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <Select value={corrente} onValueChange={(v) => v !== corrente && setPending(v as StatoPromessa)}>
        <SelectTrigger className={`h-9 w-[140px] text-xs ${CLS[corrente]}`} aria-label="Stato promessa">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATI_PROMESSA.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <AlertDialog open={!!pending} onOpenChange={(v) => !v && !saving && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiare lo stato della promessa?</AlertDialogTitle>
            <AlertDialogDescription>
              Da «{labelStatoPromessa(corrente)}» a «{labelStatoPromessa(pending)}». Il cambio viene registrato con data e autore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void conferma(); }}>
              {saving ? "Salvataggio…" : "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
