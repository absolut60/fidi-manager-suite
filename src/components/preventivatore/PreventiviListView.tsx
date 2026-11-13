import { formatNumeroIt } from "@/lib/numero-it";
import { formatDate } from "@/lib/fidi";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, Fragment } from "react";
import { useAuth } from "@/hooks/use-auth";
import { puoScriverePreventivi } from "@/lib/permessi-preventivi";
import { useFiltriPagina } from "@/hooks/use-filtri-pagina";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FiltroMultiplo } from "@/components/filtro-multiplo";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CornerDownRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchElencoPreventivi, STATI, STATI_LABEL, TIPI_DOC, TIPI_DOC_LABEL,
  type ElencoPreventivoItem, type StatoPreventivo, type TipoDoc, type TipoDocumento,
} from "@/lib/preventivi-api";
import { searchClienti } from "@/lib/preventivi-api";
import { lettereElenco } from "@/lib/preventivo-creazione";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
import { BadgeEvasione, BadgeStato, BadgeTipoDoc } from "@/components/preventivatore/BadgeTestata";
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { computeEvasione } from "@/lib/evasione";

const euro = (v: number | null | undefined) =>
  `€ ${formatNumeroIt(v ?? 0, { minDecimals: 2, maxDecimals: 2 })}`;
const evasioneDi = (r: ElencoPreventivoItem) =>
  computeEvasione((r.blocchi ?? []).flatMap((b) => b.righe ?? []));

/** Testo che va a capo su massimo 2 righe, intero nel title. */
function Testo({ children, className }: { children: string | null | undefined; className?: string }) {
  const t = children?.trim() || "—";
  return <span title={t} className={cn("line-clamp-2 break-words", className)}>{t}</span>;
}

function EtichettaLettera({ lettera, alternativa }: { lettera: string; alternativa: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-pv-azzurro-bordo bg-pv-azzurro px-1.5 text-[10px] font-semibold text-pv-blu">
      {alternativa ? `Alt. ${lettera}` : lettera}
    </span>
  );
}

/**
 * Lista documenti (preventivi o ordini) — stesso componente per entrambe le
 * entità. Filtri solo sui principali; le alternative seguono il principale
 * e sono escluse da conteggi e totali.
 */
export function PreventiviListView({ tipo }: { tipo: TipoDocumento }) {
  const navigate = useNavigate();
  const isOrdine = tipo === "ordine";
  const titolo = isOrdine ? "Ordini" : "Preventivi";
  const sottotitolo = isOrdine ? "Ordini cliente" : "Documenti commerciali per cantiere";
  const labelNuovo = isOrdine ? "Nuovo ordine" : "Nuovo preventivo";
  const labelEmpty = isOrdine ? "Nessun ordine." : "Nessun preventivo.";
  const nomeConteggio = (n: number) =>
    isOrdine ? (n === 1 ? "ordine" : "ordini") : (n === 1 ? "preventivo" : "preventivi");

  const { user, roles } = useAuth();
  const puoScrivere = puoScriverePreventivi(roles as string[]);
  const { filtri: FV, setCampo: setCampoLista } = useFiltriPagina(isOrdine ? "ordini" : "preventivatore", {
    search: "", clienteId: [] as string[], stato: [] as string[], tipoDoc: [] as string[],
    creatoDa: [] as string[], mostraAlternative: true,
  }, { userId: user?.id, valida: { clienteId: Array.isArray, stato: Array.isArray, tipoDoc: Array.isArray, creatoDa: Array.isArray } });
  const search = FV.search;
  const clienteId = FV.clienteId;
  const stato = FV.stato as StatoPreventivo[];
  const tipoDoc = FV.tipoDoc as TipoDoc[];
  const creatoDa = FV.creatoDa;
  const mostraAlternative = FV.mostraAlternative !== false;
  const [dSearch, setDSearch] = useState(() => FV.search);
  const [openNew, setOpenNew] = useState(false);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [clienteId, stato, tipoDoc, creatoDa].filter((l) => l.length > 0).length;

  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({ search: dSearch, cliente_id: clienteId, stato, tipo_doc: tipoDoc, creato_da: creatoDa, tipo }),
    [dSearch, clienteId, stato, tipoDoc, creatoDa, tipo],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["preventivi", "elenco", filters],
    queryFn: () => fetchElencoPreventivi(filters),
  });
  const { data: clienti = [] } = useQuery({
    queryKey: ["clienti-list"],
    queryFn: () => searchClienti(""),
  });

  const { principali, altPer, lettere } = useMemo(() => {
    const principali = data?.principali ?? [];
    const alternative = data?.alternative ?? [];
    const lettere = lettereElenco([...principali, ...alternative]);
    const altPer = new Map<string, ElencoPreventivoItem[]>();
    for (const a of alternative) {
      const l = altPer.get(a.alternativa_di!) ?? [];
      l.push(a);
      altPer.set(a.alternativa_di!, l);
    }
    for (const l of altPer.values()) l.sort((x, y) => (lettere.get(x.id) ?? "").localeCompare(lettere.get(y.id) ?? ""));
    return { principali, altPer, lettere };
  }, [data]);

  // Riepilogo SOLO sui principali visibili.
  const totalePrincipali = principali.reduce((s, r) => s + Number(r.totale ?? 0), 0);

  // Opzioni "Creato da": nomi presenti nell'elenco (+ quelli già selezionati).
  const opzioniCreatoDa = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...(data?.principali ?? []), ...(data?.alternative ?? [])]) {
      if (r.creato_da) m.set(r.creato_da, r.creato_da_nome ?? "Utente senza nome");
    }
    for (const id of creatoDa) if (!m.has(id)) m.set(id, "Utente");
    return [...m].map(([valore, label]) => ({ valore, label })).sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [data, creatoDa]);

  const apri = (id: string) => navigate({ to: "/preventivatore/$id", params: { id } });
  const nColonne = isOrdine ? 9 : 11;

  const riga = (r: ElencoPreventivoItem, alternativa: boolean, haAlt: boolean, indiceGruppo: number) => {
    const lettera = lettere.get(r.id) ?? "A";
    return (
      <TableRow
        key={r.id}
        onClick={() => apri(r.id)}
        className={cn("cursor-pointer text-xs hover:bg-muted/50", indiceGruppo % 2 === 1 ? "bg-muted/30" : "bg-card")}
      >
        <TableCell className={cn("px-2 py-2 align-top", (alternativa || haAlt) && "border-l-[3px] border-l-pv-blu")}>
          <div className="flex flex-wrap items-center gap-1">
            {alternativa && <CornerDownRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
            {alternativa && <EtichettaLettera lettera={lettera} alternativa />}
            <span className="font-mono font-medium">{r.numero ?? "—"}</span>
            {!alternativa && haAlt && <EtichettaLettera lettera={lettera} alternativa={false} />}
          </div>
        </TableCell>
        <TableCell className="px-2 py-2 align-top"><Testo className="font-medium">{r.titolo}</Testo></TableCell>
        <TableCell className="px-2 py-2 align-top">
          <Testo className="font-medium">{r.cliente?.ragione_sociale}</Testo>
          {r.cliente?.codice_gestionale && (
            <span className="block font-mono text-[10px] text-muted-foreground">{r.cliente.codice_gestionale}</span>
          )}
        </TableCell>
        <TableCell className="px-2 py-2 align-top text-muted-foreground"><Testo>{r.cantiere?.nome}</Testo></TableCell>
        <TableCell className="px-2 py-2 align-top"><Testo>{r.creato_da_nome}</Testo></TableCell>
        <TableCell className="px-2 py-2 align-top tabular-nums">{formatDate(r.data)}</TableCell>
        {!isOrdine && <TableCell className="px-2 py-2 align-top tabular-nums">{r.validita ? formatDate(r.validita) : "—"}</TableCell>}
        {!isOrdine && <TableCell className="px-2 py-2 align-top"><BadgeTipoDoc tipoDoc={r.tipo_doc} className="whitespace-normal px-2 text-[11px] leading-tight" /></TableCell>}
        <TableCell className="px-2 py-2 align-top"><BadgeStato stato={r.stato} className="px-2 text-[11px]" /></TableCell>
        <TableCell className="px-2 py-2 align-top"><BadgeEvasione stato={evasioneDi(r)} className="px-2 text-[11px]" /></TableCell>
        <TableCell className={cn("px-2 py-2 align-top text-right tabular-nums", alternativa ? "text-muted-foreground" : "font-semibold")}>{euro(r.totale)}</TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 p-3 lg:gap-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold lg:text-2xl">{titolo}</h1>
            <p className="text-xs text-muted-foreground lg:text-sm">{sottotitolo}</p>
          </div>
          {puoScrivere && (
            <Button size="sm" onClick={() => setOpenNew(true)} className="lg:h-10">
              <Plus className="mr-1 h-4 w-4" /> {labelNuovo}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setCampoLista("search", e.target.value)}
              placeholder="Cerca per numero, titolo o codice cliente"
              aria-label="Cerca per numero, titolo o codice cliente"
              className="h-10 pl-8 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setMostraFiltri((v) => !v)}>
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filtri
            {nFiltriAttivi > 0 && <Badge className="ml-1 h-4 px-1.5 text-[10px]">{nFiltriAttivi}</Badge>}
          </Button>
        </div>

        <div className={cn("gap-2 lg:flex lg:flex-wrap lg:items-center", mostraFiltri ? "grid grid-cols-1 sm:grid-cols-2" : "hidden")}>
          <div className="relative hidden w-full max-w-sm lg:block">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setCampoLista("search", e.target.value)}
              placeholder="Cerca per numero, titolo o codice cliente"
              aria-label="Cerca per numero, titolo o codice cliente"
              className="pl-8"
            />
          </div>
          <FiltroMultiplo
            etichetta="Cliente" testoTutti="Tutti i clienti" cercabile
            className="h-10 text-sm lg:w-56"
            opzioni={clienti.map((c) => ({ valore: c.id, label: c.ragione_sociale ?? "" }))}
            selezionati={clienteId} onChange={(v) => setCampoLista("clienteId", v)}
          />
          <FiltroMultiplo
            etichetta="Stato" testoTutti="Tutti gli stati"
            className="h-10 text-sm lg:w-40"
            opzioni={STATI.map((s) => ({ valore: s, label: STATI_LABEL[s] }))}
            selezionati={stato} onChange={(v) => setCampoLista("stato", v)}
          />
          {!isOrdine && (
            <FiltroMultiplo
              etichetta="Tipo documento" testoTutti="Tutti i tipi"
              className="h-10 text-sm lg:w-52"
              opzioni={TIPI_DOC.map((t) => ({ valore: t, label: TIPI_DOC_LABEL[t] }))}
              selezionati={tipoDoc} onChange={(v) => setCampoLista("tipoDoc", v)}
            />
          )}
          <FiltroMultiplo
            etichetta="Creato da" testoTutti="Tutti gli autori" cercabile
            className="h-10 text-sm lg:w-48"
            opzioni={opzioniCreatoDa}
            selezionati={creatoDa} onChange={(v) => setCampoLista("creatoDa", v)}
          />
          <div className="flex h-10 items-center gap-2 px-1">
            <Switch
              id={`mostra-alternative-${tipo}`}
              checked={mostraAlternative}
              onCheckedChange={(v) => setCampoLista("mostraAlternative", v)}
            />
            <Label htmlFor={`mostra-alternative-${tipo}`} className="text-sm">Mostra alternative</Label>
          </div>
        </div>

        {!isLoading && principali.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{principali.length.toLocaleString("it-IT")}</span>{" "}
            {nomeConteggio(principali.length)} · Totale{" "}
            <span className="font-semibold tabular-nums text-foreground">{euro(totalePrincipali)}</span>
          </p>
        )}

        <div className="rounded-md border bg-card">
          <div className="divide-y md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Caricamento…</div>
            ) : principali.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{labelEmpty}</div>
            ) : (
              <ElencoSchede>
                {principali.map((r, indiceGruppo) => {
                  const alt = mostraAlternative ? (altPer.get(r.id) ?? []) : [];
                  return (
                    <SchedaLista
                      key={r.id}
                      className={cn(indiceGruppo % 2 === 1 ? "bg-muted/30" : "bg-card", (altPer.get(r.id)?.length ?? 0) > 0 && "border-l-[3px] border-l-pv-blu")}
                      onClick={() => apri(r.id)}
                      colonneCampi={2}
                      titolo={
                        <span className="break-words">
                          <span className="font-mono">{r.numero ?? "—"}</span>
                          {alt.length > 0 && <> <EtichettaLettera lettera="A" alternativa={false} /></>}
                          {r.titolo && <span className="font-medium"> · {r.titolo}</span>}
                        </span>
                      }
                      badge={
                        <span className="flex flex-wrap justify-end gap-1">
                          <BadgeStato stato={r.stato} className="px-2 text-[11px]" />
                          <BadgeEvasione stato={evasioneDi(r)} className="px-2 text-[11px]" />
                        </span>
                      }
                      campi={[
                        {
                          etichetta: "Cliente",
                          valore: (
                            <span className="break-words">
                              {r.cliente?.ragione_sociale ?? "—"}
                              {r.cliente?.codice_gestionale && (
                                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.cliente.codice_gestionale}</span>
                              )}
                            </span>
                          ),
                        },
                        { etichetta: "Totale", valore: <span className="font-semibold tabular-nums">{euro(r.totale)}</span> },
                        { etichetta: "Creato da", valore: r.creato_da_nome ?? "—" },
                        { etichetta: "Data", valore: formatDate(r.data) },
                      ]}
                      footer={
                        alt.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {alt.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); apri(a.id); }}
                                className="flex min-h-10 w-full items-center gap-2 rounded border bg-transparent px-2 text-left text-xs"
                              >
                                <CornerDownRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                                <EtichettaLettera lettera={lettere.get(a.id) ?? "?"} alternativa />
                                <span className="min-w-0 flex-1 break-words font-mono">{a.numero ?? "—"}</span>
                                <BadgeStato stato={a.stato} className="shrink-0 px-2 text-[10px]" />
                                <span className="shrink-0 tabular-nums text-muted-foreground">{euro(a.totale)}</span>
                              </button>
                            ))}
                          </div>
                        ) : undefined
                      }
                    />
                  );
                })}
              </ElencoSchede>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="table-fixed min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-pv-testa text-[11px] uppercase tracking-wide hover:bg-pv-testa">
                  <TableHead className="w-[7.5rem] px-2">Numero</TableHead>
                  <TableHead className="px-2">Titolo</TableHead>
                  <TableHead className="px-2">Cliente</TableHead>
                  <TableHead className="w-[8%] px-2">Cantiere</TableHead>
                  <TableHead className="w-[7%] px-2">Creato da</TableHead>
                  <TableHead className="w-[5.5rem] px-2">Data</TableHead>
                  {!isOrdine && <TableHead className="w-[5.5rem] px-2">Validità</TableHead>}
                  {!isOrdine && <TableHead className="w-[7rem] px-2">Tipo</TableHead>}
                  <TableHead className="w-[6.25rem] px-2">Stato</TableHead>
                  <TableHead className="w-[6.25rem] px-2">Evasione</TableHead>
                  <TableHead className="w-[7rem] px-2 text-right">Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={nColonne} className="py-8 text-center text-sm text-muted-foreground">Caricamento…</TableCell></TableRow>
                ) : principali.length === 0 ? (
                  <TableRow><TableCell colSpan={nColonne} className="py-8 text-center text-sm text-muted-foreground">{labelEmpty}</TableCell></TableRow>
                ) : (
                  principali.map((r, indiceGruppo) => {
                    const alt = altPer.get(r.id) ?? [];
                    return (
                      <Fragment key={r.id}>
                        {riga(r, false, alt.length > 0, indiceGruppo)}
                        {mostraAlternative && alt.map((a) => riga(a, true, false, indiceGruppo))}
                      </Fragment>
                    );
                  })
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
