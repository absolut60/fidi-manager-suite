import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchArticoli,
  fetchFornitori,
  fetchArticoliFacets,
  type StatoArticolo,
} from "@/lib/articoli-api";
import { StatoBadge } from "@/components/articoli/StatoBadge";
import { ImportArticoliDialog } from "@/components/articoli/ImportDialog";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/articoli/")({
  head: () => ({ meta: [{ title: "Articoli — Sistema MADE" }] }),
  component: ArticoliListPage,
});

const ANY = "__any";

function ArticoliListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [tipologia, setTipologia] = useState<string | null>(null);
  const [fornitoreId, setFornitoreId] = useState<string | null>(null);
  const [stato, setStato] = useState<StatoArticolo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [categoria, tipologia, fornitoreId, stato].filter(Boolean).length;

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch,
      categoria,
      tipologia,
      fornitore_id: fornitoreId,
      stato,
    }),
    [debouncedSearch, categoria, tipologia, fornitoreId, stato],
  );

  const [page, setPage] = useState(1);
  const pageSize = 100;

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoria, tipologia, fornitoreId, stato]);

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ["articoli", filters, page, pageSize],
    queryFn: () => fetchArticoli(filters, { page, pageSize }),
  });

  const articoli = result?.rows ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori"],
    queryFn: fetchFornitori,
  });

  const { data: facets } = useQuery({
    queryKey: ["articoli-facets"],
    queryFn: fetchArticoliFacets,
  });

  async function exportCsv(onlyPotenziali: boolean) {
    // Fetch ALL matching records for export, not just the current page
    const exportFilters = onlyPotenziali
      ? { ...filters, stato: "potenziale" as StatoArticolo }
      : filters;
    const { rows } = await fetchArticoli(exportFilters, { page: 1, pageSize: 10000 });
    if (!rows.length) {
      toast.error("Nessun articolo da esportare con i filtri correnti");
      return;
    }
    const data = rows.map((a) => ({
      cod_gamma: a.cod_gamma ?? "",
      cod_fornitore: a.cod_fornitore ?? "",
      descrizione: a.descrizione,
      um: a.um ?? "",
      categoria: a.categoria ?? "",
      tipologia: a.tipologia ?? "",
      componente: a.componente ?? "",
      peso_unit: a.peso_unit ?? "",
      qta_cliente: a.qta_cliente ?? "",
      qta_fornitore: a.qta_fornitore ?? "",
      stato: a.stato,
      note: a.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `articoli_gamma${onlyPotenziali ? "_potenziali" : ""}_${
      new Date().toISOString().slice(0, 10)
    }.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportati ${rows.length} articoli`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-3 py-3 lg:px-6 lg:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 lg:gap-3">
          <div>
            <h1 className="text-lg font-bold text-navy lg:text-xl">Articoli</h1>
            <p className="text-xs text-muted-foreground lg:text-xs">
              {isLoading
                ? "Caricamento…"
                : `${total.toLocaleString("it-IT")} record · pag. ${page}/${totalPages}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 lg:gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCsv(true)}>
              <Download className="h-4 w-4 lg:mr-1" />
              <span className="hidden lg:inline">Esporta potenziali</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(false)}>
              <Download className="h-4 w-4 lg:mr-1" />
              <span className="hidden lg:inline">Esporta tutti</span>
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 lg:mr-1" />
              <span className="hidden sm:inline">Importa da GAMMA</span>
            </Button>
          </div>
        </div>

        {/* Search row (always visible) + Filtri toggle (mobile) */}
        <div className="mt-3 flex items-center gap-2 lg:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cod. o descrizione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 font-mono text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setMostraFiltri((v) => !v)}
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filtri
            {nFiltriAttivi > 0 && (
              <Badge className="ml-1 h-4 px-1.5 text-[10px]">{nFiltriAttivi}</Badge>
            )}
          </Button>
        </div>

        {/* Filters: desktop = original 12-col grid with search, mobile = collapsible 2-col grid */}
        <div
          className={cn(
            "mt-2 gap-2 lg:mt-4 lg:grid lg:grid-cols-12",
            mostraFiltri ? "grid grid-cols-2" : "hidden",
          )}
        >
          <div className="relative hidden lg:col-span-4 lg:block">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cod. GAMMA, cod. fornitore o descrizione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 font-mono text-sm"
            />
          </div>
          <FacetSelect
            label="Categoria"
            value={categoria}
            options={facets?.categorie ?? []}
            onChange={setCategoria}
            className="lg:col-span-2"
          />
          <FacetSelect
            label="Tipologia"
            value={tipologia}
            options={facets?.tipologie ?? []}
            onChange={setTipologia}
            className="lg:col-span-2"
          />
          <div className="lg:col-span-2">
            <Select
              value={fornitoreId ?? ANY}
              onValueChange={(v) => setFornitoreId(v === ANY ? null : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Fornitore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti i fornitori</SelectItem>
                {fornitori.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.ragione_sociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select
              value={stato ?? ANY}
              onValueChange={(v) => setStato(v === ANY ? null : (v as StatoArticolo))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti gli stati</SelectItem>
                <SelectItem value="attivo">Attivo</SelectItem>
                <SelectItem value="potenziale">Potenziale</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-navy text-navy-foreground">
            <tr className="text-left text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2 font-semibold">Cod. GAMMA</th>
              <th className="px-3 py-2 font-semibold">Cod. Fornitore</th>
              <th className="px-3 py-2 font-semibold">Fornitore</th>
              <th className="px-3 py-2 font-semibold">Descrizione</th>
              <th className="px-3 py-2 font-semibold">U.M.</th>
              <th className="px-3 py-2 font-semibold">Categoria</th>
              <th className="px-3 py-2 font-semibold">Tipologia</th>
              <th className="px-3 py-2 font-semibold">Stato</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  Caricamento…
                </td>
              </tr>
            ) : articoli.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  Nessun articolo trovato.
                </td>
              </tr>
            ) : (
              articoli.map((a) => {
                const forn = (
                  a as typeof a & { fornitore?: { ragione_sociale: string } | null }
                ).fornitore;
                return (
                  <tr
                    key={a.id}
                    onClick={() => navigate({ to: "/articoli/$id", params: { id: a.id } })}
                    className="cursor-pointer border-b hover:bg-muted/50"
                  >
                    <td className="px-3 py-1.5 font-mono">{a.cod_gamma ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{a.cod_fornitore ?? "—"}</td>
                    <td className="px-3 py-1.5">{forn?.ragione_sociale ?? "—"}</td>
                    <td className="px-3 py-1.5">{a.descrizione}</td>
                    <td className="px-3 py-1.5 font-mono">{a.um ?? "—"}</td>
                    <td className="px-3 py-1.5">{a.categoria ?? "—"}</td>
                    <td className="px-3 py-1.5">{a.tipologia ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <StatoBadge stato={a.stato} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t bg-card px-6 py-3 text-xs">
        <div className="text-muted-foreground">
          {total > 0
            ? `Mostro ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} di ${total.toLocaleString("it-IT")}`
            : "0 risultati"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Precedente
          </Button>
          <span className="font-mono">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Successiva →
          </Button>
        </div>
      </div>

      <ImportArticoliDialog open={importOpen} onOpenChange={setImportOpen} onDone={refetch} />
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Tutte — {label}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
