import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumeroIt } from "@/lib/numero-it";
import {
  getAllListiniSpecialiCantieri,
  type ListinoSpecialeCantiere,
} from "@/lib/cantiere-listini-api";

const ANY = "__any";

function fmt(n: number | null | undefined, dec = 5) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatNumeroIt(n, { minDecimals: dec, maxDecimals: dec });
}

function fmtData(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function deltaPct(spec: number | null, std: number | null) {
  if (spec == null || std == null || std === 0) return null;
  return ((spec - std) / std) * 100;
}

function DeltaCell({ spec, std }: { spec: number | null; std: number | null }) {
  if (spec == null || std == null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(spec - std) < 1e-9)
    return <span className="text-muted-foreground">=</span>;
  const diff = spec - std;
  const pct = deltaPct(spec, std);
  const isBetter = diff < 0;
  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums",
        isBetter ? "text-emerald-600" : "text-red-600",
      )}
    >
      {diff > 0 ? "+" : ""}
      {fmt(diff, 5)}
      {pct != null && (
        <span className="ml-1 text-[10px] opacity-80">
          ({pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

function MargineBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const color =
    value >= 30
      ? "text-emerald-600"
      : value >= 15
        ? "text-amber-600"
        : "text-red-600";
  return (
    <span className={cn("font-mono text-xs font-semibold tabular-nums", color)}>
      {value.toFixed(1)}%
    </span>
  );
}

export function PrezziCantieriView() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["prezzi-cantieri-globale"],
    queryFn: getAllListiniSpecialiCantieri,
  });

  const clienti = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data) if (r.cliente_id) m.set(r.cliente_id, r.cliente_nome);
    return [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  const categorie = useMemo(() => {
    const s = new Set<string>();
    for (const r of data) if (r.categoria) s.add(r.categoria);
    return [...s].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    return data.filter((r) => {
      if (clienteId && r.cliente_id !== clienteId) return false;
      if (categoria && r.categoria !== categoria) return false;
      if (q) {
        const hay = [r.cod_gamma, r.descrizione, r.cantiere_nome, r.cliente_nome]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, dSearch, clienteId, categoria]);

  const nCantieri = useMemo(
    () => new Set(filtered.map((r) => r.cantiere_id)).size,
    [filtered],
  );

  const margine = (r: ListinoSpecialeCantiere) => {
    if (
      r.prezzo_vendita_speciale == null ||
      r.costo_netto_speciale == null ||
      r.prezzo_vendita_speciale === 0
    )
      return null;
    return (
      ((r.prezzo_vendita_speciale - r.costo_netto_speciale) /
        r.prezzo_vendita_speciale) *
      100
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 lg:px-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cod, descrizione, cantiere, cliente…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Select
            value={clienteId ?? ANY}
            onValueChange={(v) => setClienteId(v === ANY ? null : v)}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="Tutti i clienti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tutti i clienti</SelectItem>
              {clienti.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoria ?? ANY}
            onValueChange={(v) => setCategoria(v === ANY ? null : v)}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Tutte le categorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tutte le categorie</SelectItem>
              {categorie.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            <span className="font-semibold text-navy">{filtered.length}</span> prezzi speciali su{" "}
            <span className="font-semibold text-navy">{nCantieri}</span> cantieri
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Caricamento…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">Errore: {(error as Error).message}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            🏗️ Nessun listino speciale di cantiere configurato.
            <div className="mt-1 text-xs">
              I prezzi speciali si configurano dalla scheda cliente → tab Cantieri → Listini
              speciali.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-muted/50 text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium">Cliente</th>
                  <th className="px-2 py-2 text-left font-medium">Cantiere</th>
                  <th className="px-2 py-2 text-left font-medium">Articolo</th>
                  <th className="px-2 py-2 text-left font-medium">UM</th>
                  <th className="px-2 py-2 text-left font-medium">Categoria</th>
                  <th className="px-2 py-2 text-right font-medium">Costo std</th>
                  <th className="px-2 py-2 text-right font-medium">Costo spec.</th>
                  <th className="px-2 py-2 text-right font-medium">Δ Costo</th>
                  <th className="px-2 py-2 text-right font-medium">Prezzo std</th>
                  <th className="px-2 py-2 text-right font-medium">Prezzo spec.</th>
                  <th className="px-2 py-2 text-right font-medium">Δ Prezzo</th>
                  <th className="px-2 py-2 text-right font-medium">Margine</th>
                  <th className="px-2 py-2 text-left font-medium">Note</th>
                  <th className="px-2 py-2 text-left font-medium">Aggiornato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const costoSpecDiverso =
                    r.costo_netto_speciale != null &&
                    r.costo_netto_standard != null &&
                    Math.abs(r.costo_netto_speciale - r.costo_netto_standard) > 1e-9;
                  const prezzoSpecDiverso =
                    r.prezzo_vendita_speciale != null &&
                    r.prezzo_standard != null &&
                    Math.abs(r.prezzo_vendita_speciale - r.prezzo_standard) > 1e-9;
                  return (
                    <tr
                      key={r.id}
                      onClick={() =>
                        r.cliente_id && navigate({ to: "/clienti/$clienteId", params: { clienteId: r.cliente_id } })
                      }
                      className="cursor-pointer border-b hover:bg-muted/40"
                    >
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.cliente_id) navigate({ to: "/clienti/$clienteId", params: { clienteId: r.cliente_id } });
                          }}
                          className="text-navy hover:underline"
                        >
                          {r.cliente_nome}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.cliente_id)
                              navigate({
                                to: "/clienti/$clienteId",
                                params: { clienteId: r.cliente_id },
                                search: { tab: "cantieri" },
                              });
                          }}
                          className="text-navy hover:underline"
                        >
                          {r.cantiere_nome}
                        </button>
                      </td>
                      <td className="max-w-[260px] px-2 py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="truncate">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {r.cod_gamma}
                              </span>{" "}
                              <span className="text-foreground">{r.descrizione ?? "—"}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            {r.descrizione ?? r.cod_gamma}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.um ?? "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.categoria ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {fmt(r.costo_netto_standard)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-mono tabular-nums",
                          costoSpecDiverso ? "font-semibold text-navy" : "text-foreground",
                        )}
                      >
                        {fmt(r.costo_netto_speciale)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <DeltaCell
                          spec={r.costo_netto_speciale}
                          std={r.costo_netto_standard}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {fmt(r.prezzo_standard)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-mono tabular-nums",
                          prezzoSpecDiverso ? "font-semibold text-navy" : "text-foreground",
                        )}
                      >
                        {fmt(r.prezzo_vendita_speciale)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <DeltaCell
                          spec={r.prezzo_vendita_speciale}
                          std={r.prezzo_standard}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <MargineBadge value={margine(r)} />
                      </td>
                      <td className="max-w-[180px] px-2 py-1.5">
                        {r.note ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate text-muted-foreground">{r.note}</div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md whitespace-pre-wrap">
                              {r.note}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                        {fmtData(r.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
