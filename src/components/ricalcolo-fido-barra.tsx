/**
 * Avanzamento del ricalcolo del fido teorico letto dal lock nel DB (fonte: barraRicalcolo
 * in fido-teorico-ricalcolo-lock.ts). Usato da card precalcolo, avviso dopo l'import,
 * Alert fidi, Lista clienti e proposta massiva.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { LOCK_CHIAVE, barraRicalcolo, type BarraRicalcolo, type RigaLock } from "@/lib/fido-teorico-ricalcolo-lock";

const POLL_ATTIVO_MS = 5_000;
const POLL_RIPOSO_MS = 20_000;

/** Lock del ricalcolo: ogni 5 secondi mentre è attivo, altrimenti ogni 20. */
export function useLockRicalcoloFido(): BarraRicalcolo | null {
  const { data } = useQuery({
    queryKey: ["fido-teorico-ricalcolo-lock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("configurazioni").select("valore, updated_at").eq("chiave", LOCK_CHIAVE).maybeSingle();
      return (data as RigaLock | null) ?? null;
    },
    refetchInterval: (q) => (barraRicalcolo(q.state.data ?? null, Date.now())?.tipo === "attivo" ? POLL_ATTIVO_MS : POLL_RIPOSO_MS),
  });
  return barraRicalcolo(data ?? null, Date.now());
}

/** Riquadro completo: titolo con spinner, barra, ora di avvio. */
export function RiquadroRicalcoloFido({ barra }: { barra: BarraRicalcolo | null }) {
  if (!barra) return null;
  if (barra.tipo === "interrotto") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="status">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{barra.testo}.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border-2 border-primary/50 bg-primary/10 px-3 py-3" role="status" aria-live="polite">
      <p className="flex items-start gap-2 font-semibold text-sm sm:text-base">
        <Loader2 className="size-4 mt-0.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 break-words">{barra.titolo}</span>
      </p>
      <Progress value={barra.percentuale} className="h-3" aria-label={barra.etichetta} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">{barra.etichetta}</span>
        <span className="text-muted-foreground">{barra.avviatoAlle}</span>
      </div>
    </div>
  );
}

/** Striscia compatta in cima alle pagine: solo mentre il ricalcolo è attivo. */
export function StrisciaRicalcoloFido() {
  const barra = useLockRicalcoloFido();
  if (barra?.tipo !== "attivo") return null;
  return (
    <div className="space-y-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm" role="status" aria-live="polite">
      <p className="flex items-start gap-2">
        <Loader2 className="size-4 mt-0.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 break-words">{barra.compatto}</span>
      </p>
      <Progress value={barra.percentuale} className="h-1.5" aria-label={barra.etichetta} />
    </div>
  );
}
