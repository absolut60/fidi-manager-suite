import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchCantieriLite, creaCantiereLite } from "@/lib/preventivi-api";
import { cn } from "@/lib/utils";

export function CantierePicker({
  cliente_id,
  value,
  onChange,
}: {
  cliente_id: string | null;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: cantieri = [] } = useQuery({
    queryKey: ["cantieri-lite", cliente_id],
    queryFn: () => (cliente_id ? fetchCantieriLite(cliente_id) : Promise.resolve([])),
    enabled: !!cliente_id,
  });

  const filtrati = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cantieri;
    return cantieri.filter((c) => (c.nome ?? "").toLowerCase().includes(s));
  }, [cantieri, q]);

  const label = useMemo(() => {
    if (!value) return null;
    return cantieri.find((c) => c.id === value)?.nome ?? null;
  }, [cantieri, value]);

  const testo = q.trim();
  const esisteEsatto = cantieri.some(
    (c) => (c.nome ?? "").trim().toLowerCase() === testo.toLowerCase(),
  );

  const crea = useMutation({
    mutationFn: () => creaCantiereLite(cliente_id!, testo),
    onSuccess: (nuovo) => {
      qc.invalidateQueries({ queryKey: ["cantieri-lite", cliente_id] });
      toast.success("Cantiere creato");
      onChange(nuovo.id);
      setQ("");
      setOpen(false);
    },
    onError: (e: unknown) => {
      toast.error((e as Error).message || "Errore creazione cantiere");
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={!cliente_id}
          className="w-full justify-between"
        >
          <span className="truncate">
            {label ?? (cliente_id ? "Seleziona cantiere…" : "Prima un cliente")}
          </span>
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
            placeholder="Cerca o crea cantiere…"
            className="h-7 border-0 px-0 text-xs focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          {filtrati.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nessun cantiere</div>
          ) : (
            filtrati.map((c) => (
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
                  <div className="font-medium">{c.nome}</div>
                  {(c.citta || c.provincia) && (
                    <div className="text-muted-foreground">
                      {c.citta ?? ""}
                      {c.citta && c.provincia ? " · " : ""}
                      {c.provincia ?? ""}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        {!!cliente_id && testo && !esisteEsatto && (
          <button
            type="button"
            disabled={crea.isPending}
            onClick={() => crea.mutate()}
            className="flex w-full items-center gap-2 border-t px-2 py-2 text-left text-xs font-medium hover:bg-accent disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            Crea cantiere «{testo}»
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
