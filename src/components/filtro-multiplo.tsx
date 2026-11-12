// Filtro a scelta multipla riusabile (Popover + Checkbox). Vuoto = tutti.
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OpzioneFiltro = { valore: string; label: string };

export function FiltroMultiplo({
  etichetta,
  opzioni,
  selezionati,
  onChange,
  testoTutti = "Tutti",
  cercabile = false,
  selezionaTutte = false,
  testoMolti,
  className,
  onCercaChange,
}: {
  etichetta: string;
  opzioni: OpzioneFiltro[];
  selezionati: string[];
  onChange: (v: string[]) => void;
  testoTutti?: string;
  cercabile?: boolean;
  /** Opt-in: pulsante "Seleziona tutte" (aggiunge le opzioni visibili, anche filtrate dalla ricerca). */
  selezionaTutte?: boolean;
  /** Opt-in: testo riassuntivo per più selezioni (es. n => `${n} codici`). */
  testoMolti?: (n: number) => string;
  className?: string;
  /** Opt-in: ricerca remota, senza filtrare nuovamente le opzioni ricevute. */
  onCercaChange?: (testo: string) => void;
}) {
  const [cerca, setCerca] = useState("");
  const set = useMemo(() => new Set(selezionati), [selezionati]);

  const testo =
    selezionati.length === 0
      ? testoTutti
      : selezionati.length === 1
        ? opzioni.find((o) => o.valore === selezionati[0])?.label ?? "1 selezionato"
        : testoMolti ? testoMolti(selezionati.length) : `${selezionati.length} selezionati`;

  const visibili = useMemo(() => {
    const s = cerca.trim().toLowerCase();
    return s && !onCercaChange ? opzioni.filter((o) => o.label.toLowerCase().includes(s)) : opzioni;
  }, [opzioni, cerca, onCercaChange]);

  function toggle(v: string) {
    onChange(set.has(v) ? selezionati.filter((x) => x !== v) : [...selezionati, v]);
  }

  return (
    <Popover onOpenChange={(o) => { if (!o) { setCerca(""); onCercaChange?.(""); } }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`${etichetta}: ${testo}`}
          title={testo}
          className={cn("h-9 w-full justify-between gap-2 px-3 font-normal", className)}
        >
          <span className={cn("min-w-0 truncate text-left", selezionati.length === 0 && "text-muted-foreground")}>
            {testo}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] max-w-[calc(100vw-1rem)] p-0"
      >
        {cercabile && (
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Cerca…"
              value={cerca}
              onChange={(e) => { setCerca(e.target.value); onCercaChange?.(e.target.value); }}
              aria-label={`Cerca in ${etichetta}`}
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto p-1" role="group" aria-label={etichetta}>
          {visibili.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nessun risultato</p>
          ) : (
            visibili.map((o) => {
              const id = `fm-${etichetta}-${o.valore}`.replace(/\s+/g, "-");
              return (
                <label
                  key={o.valore}
                  htmlFor={id}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-muted"
                >
                  <Checkbox id={id} checked={set.has(o.valore)} onCheckedChange={() => toggle(o.valore)} />
                  <span className="min-w-0 break-words">{o.label}</span>
                </label>
              );
            })
          )}
        </div>
        <div className={cn("border-t p-1", selezionaTutte && "grid grid-cols-2 gap-1")}>
          {selezionaTutte && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={visibili.length === 0 || visibili.every((o) => set.has(o.valore))}
              onClick={() => onChange(Array.from(new Set([...selezionati, ...visibili.map((o) => o.valore)])))}
            >
              Seleziona tutte
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={selezionati.length === 0}
            onClick={() => onChange([])}
          >
            Azzera
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
