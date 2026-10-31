/**
 * FM55 — Pezzi condivisi per l'extra rispetto al fido teorico nelle richieste.
 * La regola è solo in src/lib/fidi.ts (extraFidoTeorico / motivoExtraObbligatorio).
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extraFidoTeorico, formatEuro, MOTIVI_EXTRA_RAPIDI } from "@/lib/fidi";

/** "Teorico: X €" + (se c'è extra) evidenza dell'extra e campo motivo obbligatorio. */
export function CampoExtraTeorico({
  importo, teorico, motivo, onMotivo, compatto = false,
}: {
  importo: number | string | null | undefined;
  teorico: number | null | undefined;
  motivo: string;
  onMotivo: (v: string) => void;
  compatto?: boolean;
}) {
  const [aperto, setAperto] = useState(motivo.trim() === "");
  if (teorico === null || teorico === undefined) return null;
  const extra = extraFidoTeorico(importo, teorico);
  const manca = extra > 0 && motivo.trim() === "";
  // Solo in modalità compatta (proposta massiva): con motivo valorizzato il riquadro si chiude in una riga.
  const chiuso = compatto && !aperto && !manca;
  if (extra > 0 && chiuso) {
    return (
      <div className="w-full min-w-0 space-y-1">
        <p className="text-[11px] text-muted-foreground break-words tabular-nums">Teorico: {formatEuro(teorico)}</p>
        <div className="flex w-full min-w-0 items-start gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs">
          <Check className="size-3.5 shrink-0 text-success" aria-hidden />
          <span className="min-w-0 flex-1 break-words">
            <span className="font-semibold tabular-nums text-success">Extra +{formatEuro(extra)}</span>
            {" · "}{motivo.trim()}
          </span>
          <Button type="button" variant="link" className="ml-auto h-auto shrink-0 p-0 text-xs"
            onClick={() => setAperto(true)}>
            Modifica
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={compatto ? "w-full min-w-0 space-y-1" : "min-w-0 space-y-1"}>
      <p className="text-[11px] text-muted-foreground break-words tabular-nums">Teorico: {formatEuro(teorico)}</p>
      {extra > 0 && (
        <div className="min-w-0 space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-2">
          <p className="text-xs font-semibold text-warning break-words tabular-nums">
            Extra fido teorico: +{formatEuro(extra)}
          </p>
          <Label className="text-xs">Motivo dell'extra *</Label>
          <div className={compatto ? "flex w-full min-w-0 flex-wrap gap-1" : "flex flex-wrap gap-1.5"}>
            {MOTIVI_EXTRA_RAPIDI.map((m) => (
              <Button key={m} type="button" size="sm" variant={motivo === m ? "default" : "outline"}
                className={compatto ? "h-8 max-w-full whitespace-normal px-1.5 text-[11px] leading-tight" : "h-10 px-2.5 text-xs"} onClick={() => { onMotivo(m); setAperto(false); }}>
                {m}
              </Button>
            ))}
          </div>
          <Textarea
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            onBlur={(e) => { if (compatto && e.target.value.trim() !== "") setAperto(false); }}
            placeholder="Spiega perché serve più del fido teorico"
            rows={2}
            className={compatto ? "w-full min-w-0 min-h-16 text-xs" : "text-sm"}
            aria-invalid={manca}
          />
          {manca && <p className="text-[11px] text-destructive">Il motivo è obbligatorio.</p>}
        </div>
      )}
    </div>
  );
}

/** Badge "Extra +Y €" per le liste richieste/approvazioni (nulla se non c'è extra). */
export function BadgeExtraTeorico({ importo, teorico }: { importo: number | string | null | undefined; teorico: number | string | null | undefined }) {
  const extra = extraFidoTeorico(importo, teorico);
  if (extra <= 0) return null;
  return (
    <Badge className="shrink-0 whitespace-nowrap px-1.5 text-[10px] bg-warning/15 text-warning hover:bg-warning/20">
      Extra +{formatEuro(extra)}
    </Badge>
  );
}
