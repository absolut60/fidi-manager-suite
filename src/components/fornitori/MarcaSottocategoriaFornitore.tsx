// FM62: scelta marca (ricerca per codice o descrizione) e sottocategoria servizi.
// Le opzioni arrivano solo da opzioni_fornitori; le scritture solo da imposta_marca_fornitori /
// imposta_sottocategoria_fornitori (solo amministratore, controllo vero nel database).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { opzioniFornitori } from "@/lib/fornitori.functions";
import { cn } from "@/lib/utils";

export function useOpzioniFornitori() {
  const leggi = useServerFn(opzioniFornitori);
  return useQuery({ queryKey: ["fornitori", "opzioni"], queryFn: () => leggi(), staleTime: 10 * 60_000 });
}

const NESSUNA = "__nessuna_marca__";
/** Combobox marca: `valore` null = nessuna marca. */
export function SceltaMarca({ valore, onChange, disabled, className }: { valore: string | null; onChange: (codice: string | null) => void; disabled?: boolean; className?: string }) {
  const [aperto, setAperto] = useState(false);
  const opzioni = useOpzioniFornitori();
  const marche = opzioni.data?.marche ?? [];
  const attuale = marche.find(m => m.codice === valore);
  const etichetta = valore ? attuale ? `${attuale.descrizione ?? attuale.codice} (${attuale.codice})` : valore : "Nessuna marca";
  return <Popover open={aperto} onOpenChange={setAperto}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-expanded={aperto} aria-label="Marca" disabled={disabled} className={cn("min-h-10 w-full justify-between font-normal", className)}>
        <span className="min-w-0 truncate">{etichetta}</span><ChevronsUpDown className="size-4 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
      <Command>
        <CommandInput placeholder="Cerca codice o descrizione…" />
        <CommandList>
          <CommandEmpty>{opzioni.isPending ? "Caricamento…" : "Nessuna marca trovata."}</CommandEmpty>
          <CommandGroup>
            <CommandItem value={NESSUNA} keywords={["nessuna", "senza"]} onSelect={() => { onChange(null); setAperto(false); }}>
              <Check className={cn("size-4", valore === null ? "opacity-100" : "opacity-0")} />Nessuna marca
            </CommandItem>
            {marche.map(m => <CommandItem key={m.codice} value={m.codice} keywords={[m.descrizione ?? ""]} onSelect={() => { onChange(m.codice); setAperto(false); }}>
              <Check className={cn("size-4 shrink-0", valore === m.codice ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1 break-words">{m.descrizione ?? m.codice}</span><span className="shrink-0 font-mono text-xs text-muted-foreground">{m.codice}</span>
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

const NESSUNA_SOTTO = "__nessuna__";
/** Select sottocategoria servizi: `valore` null = nessuna. */
export function SceltaSottocategoria({ valore, onChange, disabled }: { valore: string | null; onChange: (codice: string | null) => void; disabled?: boolean }) {
  const opzioni = useOpzioniFornitori();
  return <Select value={valore ?? NESSUNA_SOTTO} disabled={disabled} onValueChange={v => onChange(v === NESSUNA_SOTTO ? null : v)}>
    <SelectTrigger aria-label="Sottocategoria" className="min-h-10 w-full"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value={NESSUNA_SOTTO}>Nessuna sottocategoria</SelectItem>
      {(opzioni.data?.sottocategorie ?? []).map(s => <SelectItem key={s.codice} value={s.codice}>{s.descrizione}</SelectItem>)}
    </SelectContent>
  </Select>;
}
