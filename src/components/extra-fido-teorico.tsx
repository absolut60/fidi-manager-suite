/**
 * FM55 — Pezzi condivisi per l'extra rispetto al fido teorico nelle richieste.
 * La regola è solo in src/lib/fidi.ts (extraFidoTeorico / motivoExtraObbligatorio).
 */
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
  if (teorico === null || teorico === undefined) return null;
  const extra = extraFidoTeorico(importo, teorico);
  const manca = extra > 0 && motivo.trim() === "";
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] text-muted-foreground break-words tabular-nums">Teorico: {formatEuro(teorico)}</p>
      {extra > 0 && (
        <div className="min-w-0 space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-2">
          <p className="text-xs font-semibold text-warning break-words tabular-nums">
            Extra fido teorico: +{formatEuro(extra)}
          </p>
          <Label className="text-xs">Motivo dell'extra *</Label>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVI_EXTRA_RAPIDI.map((m) => (
              <Button key={m} type="button" size="sm" variant={motivo === m ? "default" : "outline"}
                className="h-10 px-2.5 text-xs" onClick={() => onMotivo(m)}>
                {m}
              </Button>
            ))}
          </div>
          <Textarea
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            placeholder="Spiega perché serve più del fido teorico"
            rows={compatto ? 1 : 2}
            className={compatto ? "min-h-10 text-xs" : "text-sm"}
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
