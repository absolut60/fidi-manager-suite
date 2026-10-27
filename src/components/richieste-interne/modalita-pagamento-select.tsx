/**
 * Modalità di pagamento (facoltativa) di una richiesta interna.
 * FONTE: tabella DB codici_pagamento tramite useCodiciPagamento (non il file TS legacy).
 * Valore: { cod, testo }. Con codice: testo = descrizione al momento della scelta (fotografia).
 * A mano: cod = null, testo = quanto scritto (max 200).
 */
import { useMemo, useState } from "react";
import { ChevronsUpDown, Pencil, X, List } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";

export type ModalitaPagamento = { cod: string | null; testo: string | null };

export const MODALITA_PAGAMENTO_MAX = 200;

/** Normalizza il valore prima del salvataggio: stringhe vuote → null. */
export function normalizzaModalitaPagamento(v: ModalitaPagamento): ModalitaPagamento {
  const cod = v.cod?.trim() || null;
  const testo = v.testo?.trim().slice(0, MODALITA_PAGAMENTO_MAX) || null;
  if (!cod && !testo) return { cod: null, testo: null };
  return { cod, testo };
}

export function ModalitaPagamentoSelect({
  value,
  onChange,
  id,
}: {
  value: ModalitaPagamento;
  onChange: (v: ModalitaPagamento) => void;
  id?: string;
}) {
  const { data: codici } = useCodiciPagamento();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manuale, setManuale] = useState(!value.cod && !!value.testo);

  const filtrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = codici ?? [];
    if (!s) return list;
    return list.filter((c) => c.cod.toLowerCase().includes(s) || (c.descrizione ?? "").toLowerCase().includes(s));
  }, [codici, search]);

  const vuoto = !value.cod && !value.testo;

  if (manuale) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            value={value.testo ?? ""}
            maxLength={MODALITA_PAGAMENTO_MAX}
            onChange={(e) => onChange({ cod: null, testo: e.target.value })}
            placeholder="es. Bonifico a 30 giorni data fattura"
            className="h-10 min-w-0 flex-1 bg-background text-foreground"
            autoFocus
          />
          {!vuoto && (
            <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0"
              aria-label="Svuota modalità di pagamento" title="Svuota"
              onClick={() => onChange({ cod: null, testo: null })}>
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Button type="button" variant="link" className="h-10 px-0"
          onClick={() => { setManuale(false); onChange({ cod: null, testo: null }); }}>
          <List className="size-4 mr-1.5" />Torna all'elenco
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox"
            className="h-auto min-h-10 w-full min-w-0 flex-1 justify-between gap-2 py-2 font-normal text-left bg-background text-foreground">
            <span className={`min-w-0 break-words whitespace-normal ${vuoto ? "text-muted-foreground" : ""}`}>
              {vuoto ? "Scegli dai codici o scrivi a mano…" : value.cod ? <>{value.testo || value.cod}{" "}<span className="font-mono text-xs text-muted-foreground">({value.cod})</span></> : value.testo}
            </span>
            <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[min(20rem,calc(100vw-2rem))]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Cerca per codice o descrizione…" value={search} onValueChange={setSearch} />
            <CommandList className="max-h-72">
              <CommandEmpty>Nessun codice trovato</CommandEmpty>
              <CommandGroup>
                {filtrati.map((c) => (
                  <CommandItem key={c.cod} value={c.cod} className="min-h-10 items-start whitespace-normal"
                    onSelect={() => {
                      onChange({ cod: c.cod, testo: c.descrizione?.trim() || null });
                      setOpen(false); setSearch("");
                    }}>
                    <span className="min-w-0 break-words">
                      <span className="font-mono text-xs font-semibold">{c.cod}</span> — {c.descrizione || "—"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem value="__manuale__" className="min-h-10"
                  onSelect={() => { setOpen(false); setSearch(""); setManuale(true); onChange({ cod: null, testo: null }); }}>
                  <Pencil className="size-4 mr-2" />Scrivi a mano…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!vuoto && (
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0"
          aria-label="Svuota modalità di pagamento" title="Svuota"
          onClick={() => onChange({ cod: null, testo: null })}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
