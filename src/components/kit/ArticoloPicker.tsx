import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchArticoliFacets } from "@/lib/articoli-api";
import type { ArticoloConListini } from "@/lib/kit-api";
import { cn } from "@/lib/utils";

const ARTICOLO_SELECT = `
  id, cod_gamma, cod_fornitore, descrizione, um, peso_unit, qta_fornitore, qta_cliente,
  fornitore:fornitori(id, ragione_sociale),
  listini_acquisto:listini_acquisto(*),
  listini_vendita:listini_vendita(*)
`;

const ALL = "__all__";

export function ArticoloPicker({
  value,
  onChange,
  placeholder = "Seleziona articolo…",
  autoOpen = false,
}: {
  value: string | null;
  onChange: (articoloId: string, articolo?: ArticoloConListini | null) => void;
  placeholder?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [fornitoreFiltro, setFornitoreFiltro] = useState("");
  const [tipologiaFiltro, setTipologiaFiltro] = useState("");

  useEffect(() => {
    if (autoOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornitori")
        .select("id, ragione_sociale")
        .order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: facets } = useQuery({
    queryKey: ["articoli-facets"],
    queryFn: fetchArticoliFacets,
  });
  const tipologie = facets?.tipologie ?? [];

  const { data: items = [] } = useQuery({
    queryKey: ["articoli-picker", q, fornitoreFiltro, tipologiaFiltro],
    queryFn: async () => {
      let qb = supabase
        .from("articoli")
        .select(ARTICOLO_SELECT)
        .order("cod_gamma", { ascending: true, nullsFirst: false })
        .limit(50);
      if (fornitoreFiltro) qb = qb.eq("fornitore_id", fornitoreFiltro);
      if (tipologiaFiltro) qb = qb.eq("tipologia", tipologiaFiltro);
      if (q.trim()) {
        const s = q.trim().replace(/[%,]/g, " ");
        qb = qb.or(`cod_gamma.ilike.%${s}%,descrizione.ilike.%${s}%,cod_fornitore.ilike.%${s}%`);
      }
      const { data, error } = await qb;
      if (error) throw error;
      for (const a of (data ?? []) as unknown as ArticoloConListini[]) {
        a.listini_acquisto?.sort((x, y) => {
          const dx = x.data_validita ?? x.created_at ?? "";
          const dy = y.data_validita ?? y.created_at ?? "";
          return dy.localeCompare(dx);
        });
      }
      return (data ?? []) as unknown as ArticoloConListini[];
    },
  });

  const { data: selected } = useQuery({
    queryKey: ["articolo-picker-selected", value],
    queryFn: async () => {
      if (!value) return null;
      const { data } = await supabase
        .from("articoli")
        .select("id, cod_gamma, descrizione, um")
        .eq("id", value)
        .maybeSingle();
      return data;
    },
    enabled: !!value,
  });

  const label = useMemo(() => {
    if (!selected) return null;
    return `${selected.cod_gamma ?? "—"} · ${selected.descrizione}`;
  }, [selected]);

  const hasFilters = !!(fornitoreFiltro || tipologiaFiltro || q);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-7 w-full justify-between px-2 font-mono text-xs"
        >
          <span className="truncate">{label ?? placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <div className="grid grid-cols-1 gap-1.5 border-b p-2 sm:grid-cols-2">
          <Select
            value={fornitoreFiltro || ALL}
            onValueChange={(v) => setFornitoreFiltro(v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Fornitore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i fornitori</SelectItem>
              {fornitori.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.ragione_sociale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tipologiaFiltro || ALL}
            onValueChange={(v) => setTipologiaFiltro(v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Tipologia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le tipologie</SelectItem>
              {tipologie.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per codice o descrizione…"
            className="h-7 border-0 px-0 text-xs focus-visible:ring-0"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFornitoreFiltro("");
                setTipologiaFiltro("");
                setQ("");
              }}
              className="shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Azzera
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Nessun risultato</div>
          ) : (
            items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id, a);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-2 py-1.5 text-left text-xs hover:bg-accent",
                  value === a.id && "bg-accent/50",
                )}
              >
                <Check
                  className={cn("mt-0.5 h-3 w-3", value === a.id ? "opacity-100" : "opacity-0")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{a.cod_gamma ?? "—"}</span>
                    {(a as unknown as { fornitore?: { ragione_sociale?: string } | null }).fornitore?.ragione_sociale && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {(a as unknown as { fornitore: { ragione_sociale: string } }).fornitore.ragione_sociale}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-muted-foreground">{a.descrizione}</div>
                  {(a as unknown as { cod_fornitore?: string | null }).cod_fornitore && (
                    <div className="font-mono text-[10px] text-muted-foreground/80">
                      Cod. for.: {(a as unknown as { cod_fornitore: string }).cod_fornitore}
                    </div>
                  )}
                </div>
                <span className="font-mono text-muted-foreground">{a.um ?? ""}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
