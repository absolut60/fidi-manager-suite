/**
 * Selettore della condizione di pagamento PROPOSTA con una richiesta fido.
 * FONTE UNICA: tabella DB codici_pagamento (non il file legacy codici-pagamento.ts).
 * Usato dal modulo richiesta fido e dalla proposta fido massiva.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export type CodicePagamentoDb = { cod: string; descrizione: string | null };

/** Codici di pagamento dal DB (unico punto di caricamento per le richieste fido). */
export function useCodiciPagamento() {
  return useQuery({
    queryKey: ["codici-pagamento", "all"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("codici_pagamento")
        .select("cod, descrizione")
        .order("cod", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CodicePagamentoDb[];
    },
  });
}

export function CondizionePagamentoRichiestaSelect({
  value,
  onChange,
  size = "default",
}: {
  value: string;
  onChange: (cod: string) => void;
  size?: "default" | "sm";
}) {
  const { data: codici } = useCodiciPagamento();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sm = size === "sm";

  const filtrati = (codici ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.cod.toLowerCase().includes(q) || (c.descrizione ?? "").toLowerCase().includes(q);
  });
  const sel = (codici ?? []).find((c) => c.cod === value) ?? null;

  function scegli(cod: string) {
    onChange(cod);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={sm ? "h-8 w-full justify-between px-2 font-normal text-xs" : "w-full justify-between font-normal"}
        >
          <span className={sel ? "truncate" : "truncate text-muted-foreground"}>
            {sel
              ? sm ? sel.cod : `${sel.cod} — ${sel.descrizione ?? ""}`
              : sm ? "—" : "Seleziona condizione di pagamento…"}
          </span>
          <ChevronsUpDown className={`${sm ? "ml-1" : "ml-2"} size-4 shrink-0 opacity-50`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={sm ? "w-72 max-w-[calc(100vw-2rem)] p-0" : "w-[--radix-popover-trigger-width] p-0"} align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Cerca per codice o descrizione…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nessun codice trovato</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => scegli("")} className="text-muted-foreground italic">
                  — Nessuna —
                </CommandItem>
              )}
              {filtrati.map((c) => (
                <CommandItem key={c.cod} value={c.cod} onSelect={() => scegli(c.cod)} className="flex items-baseline gap-2">
                  <span className="font-mono text-xs shrink-0">{c.cod}</span>
                  <span className="text-sm truncate text-muted-foreground">— {c.descrizione ?? ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
