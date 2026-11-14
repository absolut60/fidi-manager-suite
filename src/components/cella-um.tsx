import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNumeroIt } from "@/lib/numero-it";

/** Cella U.M. compatta (UM1 blu, UM2 arancio); i valori restano salvati in UM1. */
export function CellaUm({ idx, etichetta, um1, um2, fattore, secondaria, disabled, onChange }: {
  idx?: number; etichetta?: string; um1: string; um2: string | null; fattore: number | null; secondaria: boolean; disabled: boolean; onChange: (v: "um1" | "um2") => void;
}) {
  const inUm2 = secondaria && !!um2;
  const box = "flex h-auto min-h-[26px] w-full items-center justify-between gap-0.5 rounded border border-transparent bg-transparent px-1 py-1 text-left text-xs leading-none shadow-none hover:border-input focus:border-ring focus:bg-card focus-visible:ring-0 [&>svg]:size-3 [&>svg]:shrink-0";
  const testo = (
    <div className="flex min-w-0 items-start">
      <span className={cn("-mt-0.5 mr-px font-sans text-[8px] font-semibold leading-none", inUm2 ? "text-pv-arancio" : "text-pv-blu")}
        title={inUm2 ? "Unità 2" : "Unità 1"} aria-label={inUm2 ? "Unità 2" : "Unità 1"}>{inUm2 ? "2" : "1"}</span>
      <span className="whitespace-nowrap font-sans text-xs font-bold leading-none text-foreground">{inUm2 ? um2 : um1}</span>
    </div>
  );
  const label = etichetta ?? `Unità di misura riga ${(idx ?? 0) + 1}`;
  if (!um2) return <div className={box} aria-label={label} role="group">{testo}</div>;
  return (
    <Select value={inUm2 ? "um2" : "um1"} disabled={disabled} onValueChange={(v) => onChange(v as "um1" | "um2")}>
      <SelectTrigger aria-label={label} className={box}>{testo}</SelectTrigger>
      <SelectContent>
        <SelectItem value="um1">{`${um1} – unità 1 (primaria)`}</SelectItem>
        <SelectItem value="um2">{`${um2} – unità 2 (secondaria)${fattore ? ` · 1 ${um2} = ${formatNumeroIt(fattore, { maxDecimals: 4 })} ${um1}` : ""}`}</SelectItem>
      </SelectContent>
    </Select>
  );
}

