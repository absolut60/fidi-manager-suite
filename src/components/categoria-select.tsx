import { useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { MACROCATEGORIE, CATEGORIE } from "@/lib/macrocategorie";
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

interface CategoriaSelectProps {
  type: "macrocategoria" | "categoria";
  codice: string;
  label_value: string;
  onChange: (codice: string, label: string) => void;
  showLabel?: boolean;
  clearable?: boolean;
}

export function CategoriaSelect({
  type,
  codice,
  label_value,
  onChange,
  showLabel = true,
  clearable = true,
}: CategoriaSelectProps) {
  const [open, setOpen] = useState(false);

  const items = type === "macrocategoria" ? MACROCATEGORIE : CATEGORIE;
  const labelText = type === "macrocategoria" ? "Macrocategoria" : "Categoria";
  const placeholder = `Seleziona ${labelText.toLowerCase()}...`;

  const displayValue = codice ? `${codice} — ${label_value}` : "";

  return (
    <div className="space-y-1.5">
      {showLabel && <Label>{labelText}</Label>}
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
              <span className={codice ? "" : "text-muted-foreground"}>
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
              <CommandInput placeholder="Cerca per codice o descrizione..." />
              <CommandList>
                <CommandEmpty>Nessun risultato</CommandEmpty>
                <CommandGroup>
                  {items.map((i) => (
                    <CommandItem
                      key={i.codice}
                      value={`${i.codice} ${i.label}`}
                      onSelect={() => {
                        onChange(i.codice, i.label);
                        setOpen(false);
                      }}
                      className="flex items-baseline gap-2"
                    >
                      <span className="font-mono text-xs font-semibold w-12 shrink-0">
                        {i.codice}
                      </span>
                      <span className="text-sm">{i.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {clearable && codice && (
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
