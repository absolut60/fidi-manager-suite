import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { cercaSoggetti, type SoggettoTrovato } from "@/lib/lead-dedup";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export type SoggettoSelezionato = { tipo: "cliente" | "lead"; id: string; etichetta: string };

/**
 * Combobox unico di ricerca identità: cerca insieme clienti e lead
 * per ragione sociale / nome / P.IVA / C.F. / email.
 */
export function SoggettoCombobox({
  onSelect,
  placeholder = "Cerca cliente o lead…",
  autoFocus = false,
  selectedId = null,
}: {
  onSelect: (s: SoggettoSelezionato) => void;
  placeholder?: string;
  autoFocus?: boolean;
  selectedId?: string | null;
}) {
  const [testo, setTesto] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(testo.trim()), 250);
    return () => window.clearTimeout(t);
  }, [testo]);

  const { data, isFetching } = useQuery({
    queryKey: ["soggetti-ricerca", debounced],
    enabled: debounced.length >= 2,
    queryFn: () => cercaSoggetti(debounced),
    staleTime: 30_000,
  });

  const risultati: SoggettoTrovato[] = data ?? [];

  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput
        value={testo}
        onValueChange={setTesto}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <CommandList>
        {debounced.length < 2 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Search className="size-4 mx-auto mb-1" />
            Digita almeno 2 caratteri
          </div>
        ) : isFetching && risultati.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Ricerca in corso…</div>
        ) : (
          <>
            <CommandEmpty>Nessun soggetto trovato</CommandEmpty>
            {risultati.length > 0 && (
              <CommandGroup>
                {risultati.map((s) => (
                  <CommandItem
                    key={`${s.tipo}-${s.id}`}
                    value={`${s.tipo}-${s.id}`}
                    onSelect={() => onSelect({ tipo: s.tipo, id: s.id, etichetta: s.etichetta })}
                    className="gap-2"
                  >
                    <Badge variant={s.tipo === "cliente" ? "default" : "secondary"} className="shrink-0">
                      {s.tipo === "cliente" ? "Cliente" : "Lead"}
                    </Badge>
                    <span className="truncate font-medium">{s.etichetta}</span>
                    {s.dettaglio && (
                      <span className="truncate text-xs text-muted-foreground">{s.dettaglio}</span>
                    )}
                    {selectedId === s.id && <Check className="size-4 ml-auto shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
