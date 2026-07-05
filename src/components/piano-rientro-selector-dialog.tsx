// Selettore cliente + apertura PianoRientroNuovoDialog.
// Stesso pattern di RegistraPromessaSelectorDialog: prima si sceglie
// il cliente (combobox con ricerca), poi si apre lo STESSO wizard usato
// nella sottotab "Piani di rientro" della scheda cliente. Nessun wizard
// duplicato: il componente riusato è `PianoRientroNuovoDialog`.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PianoRientroNuovoDialog } from "@/components/piano-rientro-nuovo-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

type Cliente = { id: string; ragione_sociale: string; codice_gestionale: string | null };

export function PianoRientroSelectorDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (pianoId: string) => void;
}) {
  const [popOpen, setPopOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open]);

  const { data: clienti, isLoading } = useQuery({
    queryKey: ["piano-rientro-clienti-search", query],
    enabled: open && popOpen,
    queryFn: async () => {
      let q = supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale")
        .order("ragione_sociale")
        .limit(30);
      if (query.trim()) {
        q = q.or(
          `ragione_sociale.ilike.%${query}%,codice_gestionale.ilike.%${query}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  return (
    <>
      <Dialog open={open && !wizardOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="size-5" /> Nuovo piano di rientro
            </DialogTitle>
            <DialogDescription>Scegli il cliente per cui creare il piano di rientro.</DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Popover open={popOpen} onOpenChange={setPopOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selected ? selected.ragione_sociale : "Seleziona cliente…"}
                  <ChevronsUpDown className="ml-2 size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Cerca ragione sociale o codice…"
                    value={query}
                    onValueChange={setQuery}
                  />
                  <CommandList>
                    <CommandEmpty>{isLoading ? "Caricamento…" : "Nessun cliente trovato"}</CommandEmpty>
                    <CommandGroup>
                      {(clienti ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setSelected(c);
                            setPopOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 size-4", selected?.id === c.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1 truncate">{c.ragione_sociale}</span>
                          {c.codice_gestionale && (
                            <span className="ml-2 text-xs text-muted-foreground font-mono">{c.codice_gestionale}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button
              disabled={!selected}
              onClick={() => setWizardOpen(true)}
              className="gap-1.5"
            >
              <CalendarClock className="size-4" /> Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <PianoRientroNuovoDialog
          open={wizardOpen}
          onOpenChange={(v) => {
            setWizardOpen(v);
            if (!v) onOpenChange(false);
          }}
          clienteId={selected.id}
          clienteLabel={selected.ragione_sociale}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
