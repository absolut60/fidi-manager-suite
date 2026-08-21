import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchPreventivi, STATI, STATI_LABEL, TIPI_DOC, TIPI_DOC_LABEL,
  type StatoPreventivo, type TipoDoc, type TipoDocumento,
} from "@/lib/preventivi-api";
import { searchClienti } from "@/lib/preventivi-api";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
import { EvasioneBadge } from "@/components/preventivatore/EvasioneBadge";
import { computeEvasione } from "@/lib/evasione";


const ANY = "__any";

/**
 * Lista documenti (preventivi o ordini) — stesso componente riusato per
 * entrambe le entità. La prop `tipo` filtra in lettura e adatta etichette.
 */
export function PreventiviListView({ tipo }: { tipo: TipoDocumento }) {
  const navigate = useNavigate();
  const isOrdine = tipo === "ordine";
  const titolo = isOrdine ? "Ordini" : "Preventivi";
  const sottotitolo = isOrdine
    ? "Ordini cliente"
    : "Documenti commerciali per cantiere";
  const labelNuovo = isOrdine ? "Nuovo ordine" : "Nuovo preventivo";
  const labelEmpty = isOrdine ? "Nessun ordine." : "Nessun preventivo.";

  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [stato, setStato] = useState<StatoPreventivo | null>(null);
  const [tipoDoc, setTipoDoc] = useState<TipoDoc | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [clienteId, stato, tipoDoc].filter(Boolean).length;

  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({ search: dSearch, cliente_id: clienteId, stato, tipo_doc: tipoDoc, tipo }),
    [dSearch, clienteId, stato, tipoDoc, tipo],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["preventivi", filters],
    queryFn: () => fetchPreventivi(filters),
  });

  const { data: clienti = [] } = useQuery({
    queryKey: ["clienti-list"],
    queryFn: () => searchClienti(""),
  });

  return (
    <>
      <div className="flex flex-col gap-2 p-3 lg:gap-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold lg:text-2xl">{titolo}</h1>
            <p className="text-xs text-muted-foreground lg:text-sm">{sottotitolo}</p>
          </div>
          <Button size="sm" onClick={() => setOpenNew(true)} className="lg:h-10">
            <Plus className="mr-1 h-4 w-4" /> {labelNuovo}
          </Button>
        </div>

        {/* Search + Filtri toggle (mobile) */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per numero…"
              className="h-9 pl-8 text-sm"
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

        <div
          className={cn(
            "gap-2 lg:flex lg:flex-wrap lg:items-center",
            mostraFiltri ? "grid grid-cols-2" : "hidden",
          )}
        >
          <div className="relative hidden w-full max-w-sm lg:block">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per numero…"
              className="pl-8"
            />
          </div>
          <Select value={clienteId ?? ANY} onValueChange={(v) => setClienteId(v === ANY ? null : v)}>
            <SelectTrigger className="h-9 text-sm lg:h-10 lg:w-56"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tutti i clienti</SelectItem>
              {clienti.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.ragione_sociale}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stato ?? ANY} onValueChange={(v) => setStato(v === ANY ? null : (v as StatoPreventivo))}>
            <SelectTrigger className="h-9 text-sm lg:h-10 lg:w-40"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tutti gli stati</SelectItem>
              {STATI.map((s) => (
                <SelectItem key={s} value={s}>{STATI_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isOrdine && (
            <Select value={tipoDoc ?? ANY} onValueChange={(v) => setTipoDoc(v === ANY ? null : (v as TipoDoc))}>
              <SelectTrigger className="h-9 text-sm lg:h-10 lg:w-56"><SelectValue placeholder="Tipo doc" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti i tipi</SelectItem>
                {TIPI_DOC.map((t) => (
                  <SelectItem key={t} value={t}>{TIPI_DOC_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase tracking-wide">
                <TableHead className="w-32">Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cantiere</TableHead>
                <TableHead className="w-28">Data</TableHead>
                {!isOrdine && <TableHead className="w-40">Tipo doc</TableHead>}
                <TableHead className="w-28">Stato</TableHead>
                <TableHead className="w-32 text-right">Totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={isOrdine ? 6 : 7} className="py-8 text-center text-sm text-muted-foreground">Caricamento…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={isOrdine ? 6 : 7} className="py-8 text-center text-sm text-muted-foreground">{labelEmpty}</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => navigate({ to: "/preventivatore/$id", params: { id: r.id } })}
                    className="cursor-pointer text-sm hover:bg-muted/50"
                  >
                    <TableCell className="font-mono">{r.numero ?? "—"}</TableCell>
                    <TableCell className="truncate">{r.cliente?.ragione_sociale ?? "—"}</TableCell>
                    <TableCell className="truncate text-muted-foreground">{r.cantiere?.nome ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.data}</TableCell>
                    {!isOrdine && <TableCell className="text-xs">{TIPI_DOC_LABEL[r.tipo_doc]}</TableCell>}
                    <TableCell>
                      {isOrdine ? (
                        <Badge variant={r.stato === "confermato" ? "default" : r.stato === "inviato" ? "secondary" : "outline"}>
                          {STATI_LABEL[r.stato]}
                        </Badge>
                      ) : (
                        <EvasioneBadge
                          stato={computeEvasione((r.blocchi ?? []).flatMap((b) => b.righe ?? []))}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">€ {Number(r.totale ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))

              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <NuovoPreventivoDialog open={openNew} onOpenChange={setOpenNew} tipo={tipo} />
    </>
  );
}
