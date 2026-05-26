import { useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { CODICI_PAGAMENTO } from "@/lib/codici-pagamento";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CondizionePagamentoSelectProps {
  cod: string;
  desc: string;
  onChange: (cod: string, desc: string) => void;
  label?: boolean;
  placeholder?: string;
  clearable?: boolean;
}

export function CondizionePagamentoSelect({
  cod,
  desc,
  onChange,
  label = true,
  placeholder = "Cerca per codice o descrizione...",
  clearable = true,
}: CondizionePagamentoSelectProps) {
  const [open, setOpen] = useState(false);

  const displayValue = cod ? `${cod} — ${desc}` : "";

  return (
    <div className="space-y-1.5">
      {label && <Label>Condizione di pagamento</Label>}
      <div className="flex gap-2 items-start">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between font-normal"
            >
              <span className={cod ? "" : "text-muted-foreground"}>
                {displayValue || placeholder}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command
              filter={(value, search) => {
                if (!search) return 1;
                return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder={placeholder} />
              <CommandList>
                <CommandEmpty>Nessun risultato</CommandEmpty>
                <CommandGroup>
                  {CODICI_PAGAMENTO.map((c) => (
                    <CommandItem
                      key={c.cod}
                      value={`${c.cod} ${c.desc}`}
                      onSelect={() => {
                        onChange(c.cod, c.desc);
                        setOpen(false);
                      }}
                      className="flex items-baseline gap-2"
                    >
                      <span className="font-mono text-xs font-semibold w-16 shrink-0">
                        {c.cod}
                      </span>
                      <span className="text-sm">{c.desc}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {clearable && cod && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange("", "")}
            title="Rimuovi"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
