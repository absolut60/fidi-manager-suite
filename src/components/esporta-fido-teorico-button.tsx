/**
 * Pulsante "Esporta fido teorico": scarica un XLSX con tutti i clienti
 * visibili all'utente e i valori del motore di fido teorico.
 * Sola lettura, nessuna modifica al motore o al database.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getMesiAttiviUltimi12 } from "@/lib/fido-teorico-export.functions";
import {
  costruisciWorkbook,
  nomeFileExport,
  raccogliDatiFidoTeorico,
  scaricaWorkbook,
  type ProgressoExport,
} from "@/lib/fido-teorico-export";

export function EsportaFidoTeoricoButton({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "secondary" | "default";
}) {
  const mesiAttiviFn = useServerFn(getMesiAttiviUltimi12);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<ProgressoExport>({ fase: "", percentuale: 0 });

  async function esporta() {
    setBusy(true);
    setProg({ fase: "Preparazione...", percentuale: 2 });
    try {
      const mesiAttivi = (await mesiAttiviFn({ data: undefined } as any)) as Record<string, number>;
      const { righe, mesiRolling } = await raccogliDatiFidoTeorico(mesiAttivi, setProg);
      if (righe.length === 0) {
        toast.error("Nessun cliente da esportare");
        return;
      }
      const estrattoIl = new Date();
      const wb = costruisciWorkbook(righe, { estrattoIl, mesiRolling });
      setProg({ fase: "Scrittura del file...", percentuale: 97 });
      scaricaWorkbook(wb, nomeFileExport(estrattoIl));
      toast.success(`Esportati ${righe.length.toLocaleString("it-IT")} clienti`);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore durante l'esportazione");
    } finally {
      setBusy(false);
      setProg({ fase: "", percentuale: 0 });
    }
  }

  return (
    <div className={className}>
      <Button variant={variant} onClick={esporta} disabled={busy} className="gap-1.5 w-full sm:w-auto">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Esporta fido teorico
      </Button>
      {busy && (
        <div className="mt-2 w-full sm:w-64">
          <Progress value={prog.percentuale} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1">{prog.fase}</p>
        </div>
      )}
    </div>
  );
}
