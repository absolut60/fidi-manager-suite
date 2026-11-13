import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cercaArticoliPreventivo } from "@/lib/articoli-preventivo.functions";

export interface ArticoloGammaScelto { codice: string; descrizione: string | null; marca: string | null; um: string | null }

/** FM65: selettore articoli del catalogo Gamma per la riga preventivo. Non mostra prezzi (seguono il cliente). */
export function ArticoloGammaPicker({
  codice, descrizione, onChange, autoOpen = false, disabled = false, soloCodice = false,
}: {
  codice: string | null;
  descrizione: string | null;
  onChange: (a: ArticoloGammaScelto) => void;
  autoOpen?: boolean;
  disabled?: boolean;
  soloCodice?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const cerca = useServerFn(cercaArticoliPreventivo);

  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  useEffect(() => {
    const t = window.setTimeout(() => setQDeb(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data: items = [], isFetching } = useQuery({
    queryKey: ["articoli-gamma-preventivo", qDeb],
    queryFn: () => cerca({ data: { testo: qDeb } }),
    enabled: open && qDeb.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const label = codice ? (soloCodice ? codice : `${codice} · ${descrizione ?? ""}`) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={soloCodice ? "ghost" : "outline"} role="combobox" disabled={disabled}
          title={label ?? undefined}
          className={soloCodice ? "h-auto min-h-[26px] w-full justify-start rounded border border-transparent bg-transparent whitespace-normal px-1.5 py-1 text-left font-mono text-xs shadow-none hover:border-input hover:bg-transparent focus:border-ring focus:bg-card focus-visible:ring-0" : "h-auto min-h-8 w-full justify-between whitespace-normal px-2 py-1 text-left font-mono text-xs"}>
          <span className={soloCodice ? "min-w-0 break-all whitespace-normal" : "line-clamp-2 min-w-0 break-words"}>{label ?? (soloCodice ? "Scegli codice…" : "Cerca articolo Gamma…")}</span>
          {!soloCodice && <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,520px)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Codice, descrizione o marca…" aria-label="Cerca articolo Gamma"
            className="h-9 border-0 px-0 text-sm focus-visible:ring-0" />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {qDeb.length < 2 ? (
            <div className="p-3 text-xs text-muted-foreground">Scrivi almeno 2 caratteri.</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">{isFetching ? "Ricerca…" : "Nessun articolo trovato."}</div>
          ) : items.map((a) => (
            <Button key={a.codice} type="button" variant="ghost"
              onClick={() => { onChange(a); setOpen(false); }}
              className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] gap-2 whitespace-normal rounded-none border-b px-2 py-2 text-left text-xs hover:bg-accent">
              <span className="min-w-0">
                <span className="font-mono font-semibold">{a.codice}</span>
                <span className="block break-words">{a.descrizione}</span>
                {a.marca && <span className="block font-semibold text-primary">{a.marca}</span>}
              </span>
              <span className="shrink-0 text-muted-foreground">{a.um ?? ""}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
