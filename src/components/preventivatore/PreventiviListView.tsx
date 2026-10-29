import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
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
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { computeEvasione } from "@/lib/evasione";



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

  // Filtri conservati (useFiltriPagina), chiave distinta per preventivi e ordini.
  // Elenco vuoto = tutti.
  const { user } = useAuth();
  const { filtri: FV, setCampo: setCampoLista } = useFiltriPagina(isOrdine ? "ordini" : "preventivatore", {
    search: "", clienteId: [] as string[], stato: [] as string[], tipoDoc: [] as string[],
  }, { userId: user?.id, valida: { clienteId: Array.isArray, stato: Array.isArray, tipoDoc: Array.isArray } });
  const search = FV.search;
  const clienteId = FV.clienteId;
  const stato = FV.stato as StatoPreventivo[];
  const tipoDoc = FV.tipoDoc as TipoDoc[];
  const setSearch = (v: string) => setCampoLista("search", v);
  const setClienteId = (v: string[]) => setCampoLista("clienteId", v);
  const setStato = (v: string[]) => setCampoLista("stato", v);
  const setTipoDoc = (v: string[]) => setCampoLista("tipoDoc", v);
  const [dSearch, setDSearch] = useState(() => FV.search);
  const [openNew, setOpenNew] = useState(false);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [clienteId, stato, tipoDoc].filter((l) => l.length > 0).length;

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
          <FiltroMultiplo
            etichetta="Cliente" testoTutti="Tutti i clienti" cercabile
            className="h-9 text-sm lg:h-10 lg:w-56"
            opzioni={clienti.map((c) => ({ valore: c.id, label: c.ragione_sociale ?? "" }))}
            selezionati={clienteId} onChange={setClienteId}
          />
          <FiltroMultiplo
            etichetta="Stato" testoTutti="Tutti gli stati"
            className="h-9 text-sm lg:h-10 lg:w-40"
            opzioni={STATI.map((s) => ({ valore: s, label: STATI_LABEL[s] }))}
            selezionati={stato} onChange={setStato}
          />
          {!isOrdine && (
            <FiltroMultiplo
              etichetta="Tipo documento" testoTutti="Tutti i tipi"
              className="h-9 text-sm lg:h-10 lg:w-56"
              opzioni={TIPI_DOC.map((t) => ({ valore: t, label: TIPI_DOC_LABEL[t] }))}
              selezionati={tipoDoc} onChange={setTipoDoc}
            />
          )}
        </div>

        <div className="rounded-md border bg-card">
          <div className="md:hidden divide-y">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Caricamento…</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{labelEmpty}</div>
            ) : (
              <ElencoSchede>
                {rows.map((r) => (
                  <SchedaLista
                    key={r.id}
                    onClick={() => navigate({ to: "/preventivatore/$id", params: { id: r.id } })}
                    colonneCampi={2}
                    titolo={`${r.numero ?? "—"} · ${r.cliente?.ragione_sociale ?? "—"}`}
                    badge={
                      isOrdine ? (
                        <Badge variant={r.stato === "confermato" ? "default" : r.stato === "inviato" ? "secondary" : "outline"}>
                          {STATI_LABEL[r.stato]}
                        </Badge>
                      ) : (
                        <EvasioneBadge stato={computeEvasione((r.blocchi ?? []).flatMap((b) => b.righe ?? []))} />
                      )
                    }
                    campi={[
                      { etichetta: "Cantiere", valore: r.cantiere?.nome ?? "—" },
                      { etichetta: "Data", valore: r.data },
                      ...(!isOrdine ? [{ etichetta: "Tipo doc", valore: TIPI_DOC_LABEL[r.tipo_doc] }] : []),
                      { etichetta: "Totale", valore: <span className="tabular-nums font-medium">€ {Number(r.totale ?? 0).toFixed(2)}</span> },
                    ]}
                  />
                ))}
              </ElencoSchede>
            )}
          </div>
          <div className="hidden md:block">
            <Table className="min-w-[800px]">
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
      </div>

      <NuovoPreventivoDialog open={openNew} onOpenChange={setOpenNew} tipo={tipo} />
    </>
  );
}
