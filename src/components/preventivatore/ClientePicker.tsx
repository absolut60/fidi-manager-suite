import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cercaClientiPreventivo, fetchDatiClientePreventivo } from "@/lib/preventivi-api";
import { cn } from "@/lib/utils";

export function ClientePicker({
  value,
  onChange,
  placeholder = "Seleziona cliente…",
}: {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: items = [] } = useQuery({
    queryKey: ["clienti-preventivo-search", q],
    queryFn: () => cercaClientiPreventivo(q),
  });
  const { data: selected } = useQuery({
    queryKey: ["cliente-preventivo-dati", value],
    queryFn: () => (value ? fetchDatiClientePreventivo(value) : null),
    enabled: !!value,
  });

  const label = useMemo(
    () => (selected ? [selected.codice_gestionale, selected.ragione_sociale].filter(Boolean).join(" · ") : null),
    [selected],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-label="Cliente" aria-expanded={open} className="h-auto min-h-10 w-full min-w-0 justify-between">
          <span className="min-w-0 break-words whitespace-normal text-left">{label ?? placeholder}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per codice, ragione sociale o P.IVA"
            aria-label="Cerca per codice, ragione sociale o P.IVA"
            className="h-10 border-0 px-0 text-xs focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nessun risultato</div>
          ) : (
            items.map((c) => (
              <Button
                key={c.id}
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className={cn(
                  "h-auto min-h-10 w-full items-start justify-start gap-2 rounded-none border-b bg-popover px-2 py-2 text-left text-xs text-popover-foreground whitespace-normal hover:bg-pv-azzurro hover:text-popover-foreground focus-visible:bg-pv-azzurro",
                )}
              >
                <Check
                  className={cn("mt-0.5 h-3 w-3", value === c.id ? "opacity-100" : "opacity-0")}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">{c.codice_gestionale && <span className="text-muted-foreground">{c.codice_gestionale} · </span>}{c.ragione_sociale}</div>
                  <div className="text-muted-foreground">
                    {c.partita_iva ?? ""} {c.provincia ? `· ${c.provincia}` : ""}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
