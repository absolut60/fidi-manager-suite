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

type CatalogoPagamento = readonly CodicePagamentoDb[] | null | undefined;

function trovaCodicePagamento(codici: CatalogoPagamento, cod: string | null | undefined) {
  const codice = cod?.trim().toUpperCase();
  return codice ? codici?.find((c) => c.cod.trim().toUpperCase() === codice) : undefined;
}

export function descrizioneCodicePagamento(codici: CatalogoPagamento, cod: string | null | undefined): string | null {
  return trovaCodicePagamento(codici, cod)?.descrizione?.trim() || null;
}

function descrizioneVisualizzata(codici: CatalogoPagamento, cod: string | null | undefined, descFallback?: string | null) {
  // Il fallback anagrafico vale solo per codici assenti dal catalogo.
  return trovaCodicePagamento(codici, cod)
    ? descrizioneCodicePagamento(codici, cod)
    : descFallback?.trim() || null;
}

export function etichettaCondizionePagamento(codici: CatalogoPagamento, cod: string | null | undefined, descFallback?: string | null): string {
  const codice = cod?.trim();
  if (!codice) return "—";
  const descrizione = descrizioneVisualizzata(codici, codice, descFallback);
  return descrizione ? `${descrizione} (${codice})` : codice;
}

export function CondizionePagamentoTesto({ cod, descFallback }: { cod?: string | null; descFallback?: string | null }) {
  const { data: codici } = useCodiciPagamento();
  const codice = cod?.trim();
  const descrizione = descrizioneVisualizzata(codici, codice, descFallback);
  return (
    <span className="min-w-0 break-words [overflow-wrap:anywhere]" title={etichettaCondizionePagamento(codici, codice, descFallback)}>
      {codice ? <>{descrizione && <>{descrizione}{" "}</>}<span className="font-mono text-xs text-muted-foreground">{descrizione ? `(${codice})` : codice}</span></> : "—"}
    </span>
  );
}

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
  const etichetta = etichettaCondizionePagamento(codici, value);

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
          title={value ? etichetta : undefined}
          className={sm ? "h-10 min-w-0 w-full justify-between px-2 font-normal text-xs" : "min-w-0 w-full justify-between font-normal"}
        >
          <span className={value ? "min-w-0 flex items-baseline gap-1" : "min-w-0 truncate text-muted-foreground"}>
            {value
              ? <><span className="truncate">{descrizioneCodicePagamento(codici, value)}</span><span className="shrink-0 font-mono text-xs text-muted-foreground">{descrizioneCodicePagamento(codici, value) ? `(${value.trim()})` : value.trim()}</span></>
              : sm ? "—" : "Seleziona condizione di pagamento…"}
          </span>
          <ChevronsUpDown className={`${sm ? "ml-1" : "ml-2"} size-4 shrink-0 opacity-50`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={sm ? "w-80 max-w-[calc(100vw-2rem)] p-0" : "w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"} align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Cerca per codice o descrizione…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nessun codice trovato</CommandEmpty>
            <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => scegli("")} className="text-muted-foreground italic">
                  — Nessuna —
                </CommandItem>
              {filtrati.map((c) => (
                <CommandItem key={c.cod} value={c.cod} onSelect={() => scegli(c.cod)} className="flex items-baseline gap-2">
                  <CondizionePagamentoTesto cod={c.cod} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
