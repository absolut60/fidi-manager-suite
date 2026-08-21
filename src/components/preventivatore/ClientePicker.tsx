import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchClienti, fetchCliente } from "@/lib/preventivi-api";
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
    queryKey: ["clienti-search", q],
    queryFn: () => searchClienti(q),
  });
  const { data: selected } = useQuery({
    queryKey: ["cliente", value],
    queryFn: () => (value ? fetchCliente(value) : null),
    enabled: !!value,
  });

  const label = useMemo(
    () => (selected ? selected.ragione_sociale : null),
    [selected],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          <span className="truncate">{label ?? placeholder}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca cliente…"
            className="h-7 border-0 px-0 text-xs focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nessun risultato</div>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-2 py-1.5 text-left text-xs hover:bg-accent",
                  value === c.id && "bg-accent/50",
                )}
              >
                <Check
                  className={cn("mt-0.5 h-3 w-3", value === c.id ? "opacity-100" : "opacity-0")}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.ragione_sociale}</div>
                  <div className="text-muted-foreground">
                    {c.piva ?? ""} {c.provincia ? `· ${c.provincia}` : ""}{" "}
                    {c.fascia_listino_default ? `· Fascia ${c.fascia_listino_default}` : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
