import { FornitoreRigaOrdine } from './FornitoreRigaOrdine';
import { fornitoriRigheOrdine, type FornitoreOrdine } from '@/lib/fornitori-riga-ordine';
import { fetchPrezzoPreventivoArticolo, type CondizioniPrezziPreventivo } from "@/lib/prezzi-preventivo";
import { CellaEvasione } from "./CellaEvasione";
import { statoEvasioneRiga } from "@/lib/evasione";
import { messaggioEsitoEliminazione } from "@/lib/esito-eliminazione";
import { opzioniPrezziCantiere } from "@/lib/cantiere-listini-api";
import { CellaUm } from "@/components/cella-um";
import { useEffect, useMemo, useState } from "react";
import { ArticoloDettaglioDialog } from "@/components/preventivatore/ArticoloDettaglioDialog";
import { RiepilogoArticoloDialog } from "@/components/preventivatore/RiepilogoArticoloDialog";
import { ArticoloInDefinizioneDialog } from "@/components/preventivatore/ArticoloInDefinizioneDialog";
import { Info } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import { ArticoloGammaPicker, type ArticoloGammaScelto } from "@/components/preventivatore/ArticoloGammaPicker";
import { segnoPrezzoCantiere, costoRiga, costoUnitRiga, formatScontiGamma, isIntestazioneKit, margineTotaliRighe, patchConImporto, parseScontiGamma, prezzoNettoRiga, rigaInUnita } from "@/lib/riga-preventivo";
import { campiRigaGammaPreventivo } from '@/lib/riga-gamma-preventivo';
import {
  calcolaBlocco, deleteRiga, salvaPatchRigaCalcolata, fractionalOrder, insertRiga, reorderRighe,
  TIPI_RIGA, TIPI_RIGA_LABEL, updateRiga,
  type BloccoConRighe, type PreventivoConDettagli, type Riga, type RigaUpdate, type TipoRiga,
} from "@/lib/preventivi-api";
import type { FasciaListino } from "@/lib/articoli-api";
import { formatNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";
import { lineaPreventivo } from "@/lib/linee-preventivo";
import { applicaLeva, levaDaNetto, nettoShowroomModificabile, ricaricoImplicito } from "@/lib/leve-prezzo-showroom";
import { isRaccoglitorePosa } from "@/lib/riga-preventivo";
import { toast } from "sonner";
import { useIsTablet } from "@/hooks/use-tablet";

export function RigheTable({
  solaLetturaGamma = false,
  blocco,
  mostraEvasione = false,
  tipoDocumento = "preventivo", fornitoreModificabile = false,
  preventivoId,
  fascia,
  readOnly = false,
  clienteId,
  scontoPiede = 0,
  cantiereId,
  sedeGiacenzaId = null, sedeNome = null, condizioniPrezzi, linea, regimeIva,
}: {
  /** FM75 F3c: regime IVA del documento (toggle BS solo con regimiIva e agevolata_10_bs). */
  solaLetturaGamma?: boolean;
  regimeIva?: string | null;
  mostraEvasione?: boolean;
  tipoDocumento?: string; fornitoreModificabile?: boolean;
  /** FM75 F1: linea del preventivo, passata dalla pagina. */
  linea?: unknown;
  condizioniPrezzi: CondizioniPrezziPreventivo;
  blocco: BloccoConRighe;
  preventivoId: string;
  fascia: FasciaListino;
  readOnly?: boolean;
  clienteId: string | null;
  scontoPiede?: number;
  cantiereId?: string | null;
  sedeGiacenzaId?: string | null; sedeNome?: string | null;
}) {
  const [openArticoloId, setOpenArticoloId] = useState<string | null>(null);
  const [pendingPickerId, setPendingPickerId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: prezziCantiere = [] } = useQuery({ ...opzioniPrezziCantiere(cantiereId ?? ""), enabled: !!cantiereId });
  const dedicati = useMemo(() => new Map(prezziCantiere.map(p => [p.cod_gamma, p])), [prezziCantiere]);
  const fornitori = useQuery({
    queryKey: ['fornitori-righe-ordine', blocco.righe.map(r => [r.id, r.articolo_codice, r.fornitore_id])],
    queryFn: () => fornitoriRigheOrdine(blocco.righe), enabled: tipoDocumento === 'ordine',
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });

  useEffect(() => {
    if (!pendingPickerId) return;
    const exists = blocco.righe.some((r) => r.id === pendingPickerId);
    if (exists) {
      const t = window.setTimeout(() => setPendingPickerId(null), 600);
      return () => window.clearTimeout(t);
    }
  }, [pendingPickerId, blocco.righe]);



  const { bloccoConMisure: conMisure, righeStampabili, regimiIva, articoloInDefinizione, colonneGammaRiga: gamma, importoInTestataBlocco } = lineaPreventivo(linea).blocchi;
  // Colonne della tabella: 17 complete (+1 incidenza), senza colonne Gamma −4 +1 (Ricarico %).
  const nColonne = (gamma ? 17 : 14) + (conMisure ? 1 : 0) + (mostraEvasione ? 1 : 0);
  const conBs = regimiIva && regimeIva === "agevolata_10_bs";
  const calcs = useMemo(() => calcolaBlocco(blocco.righe), [blocco.righe]);
  const [riepilogoRigaId, setRiepilogoRigaId] = useState<string | null>(null);
  const calcMap = useMemo(() => new Map(calcs.righe.map((r) => [r.id, r.calc])), [calcs]);
  const tabellaKit = !!blocco.kit_id && gamma && conMisure && blocco.righe.some(r => r.ruolo_kit != null);

  // FM65 R2b: le modifiche di cella aggiornano subito la sola riga in cache (stesso calcolo
  // patchConImporto) e salvano in background, senza ricaricare preventivo e dati Gamma.
  // Cambio articolo o tipo riga restano sul percorso completo (cambiano i dati Gamma).
  const chiave = ["preventivo", preventivoId];
  const upd = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: async ({ id, patch }: { id: string; patch: RigaUpdate }) => {
      const t0 = performance.now();
      if ("articolo_codice" in patch || "tipo_riga" in patch) {
        await updateRiga(id, patch);
        await invalidate();
      } else {
        const prev = qc.getQueryData<PreventivoConDettagli>(chiave);
        const riga = blocco.righe.find((r) => r.id === id);
        if (!prev || !riga) { await updateRiga(id, patch); await invalidate(); return; }
        const calcolata = patchConImporto(riga, patch, blocco.quantita_base);
        await salvaPatchRigaCalcolata(id, calcolata, preventivoId, { iva_perc: prev.iva_perc ?? 22, regime_iva: prev.regime_iva });
      }
      if (import.meta.env.DEV) console.debug(`[preventivo] salvataggio riga ${Math.round(performance.now() - t0)} ms`);
    },
    onMutate: async ({ id, patch }) => {
      if ("articolo_codice" in patch || "tipo_riga" in patch) return { prima: undefined };
      await qc.cancelQueries({ queryKey: chiave });
      const prima = qc.getQueryData<PreventivoConDettagli>(chiave);
      if (prima) {
        qc.setQueryData<PreventivoConDettagli>(chiave, {
          ...prima,
          blocchi: prima.blocchi.map((b) => b.id !== blocco.id ? b : {
            ...b,
            righe: b.righe.map((r) => r.id !== id ? r : ({ ...r, ...patchConImporto(r, patch, b.quantita_base) }) as typeof r),
          }),
        });
      }
      return { prima };
    },
    onError: (e: unknown, _v, ctx) => {
      if (ctx?.prima) qc.setQueryData(chiave, ctx.prima);
      toast.error(`Modifica non salvata: ${(e as Error).message}`);
    },
  });
  const salvaFornitore = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: ({ id, fornitoreId }: { id: string; fornitoreId: string }) => updateRiga(id, { fornitore_id: fornitoreId }),
    onSuccess: invalidate,
  });
  const del = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: (id: string) => deleteRiga(id),
    onSuccess: (esito) => {
      if (esito.tipo !== "eliminato") { toast.error(messaggioEsitoEliminazione(esito, "la riga")); return; }
      return invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const ins = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: (row: Parameters<typeof insertRiga>[0]) => insertRiga(row),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  function ordineAround(idx: number, where: "above" | "below"): number {
    const r = blocco.righe;
    const cur = Number(r[idx]?.ordine ?? 0);
    if (where === "above") {
      const prev = idx > 0 ? Number(r[idx - 1].ordine ?? 0) : null;
      return fractionalOrder(prev, cur);
    }
    const next = idx < r.length - 1 ? Number(r[idx + 1].ordine ?? 0) : null;
    return fractionalOrder(cur, next);
  }

  async function addRow(idx: number | null, tipo: TipoRiga) {
    const ordine =
      idx == null
        ? fractionalOrder(
            blocco.righe.length ? Number(blocco.righe[blocco.righe.length - 1].ordine ?? 0) : null,
            null,
          )
        : ordineAround(idx, "below");
    ins.mutate({
      blocco_id: blocco.id,
      tipo_riga: tipo,
      ordine,
      segno: 1,
      descrizione: tipo === "nota" ? "Nota…" : tipo === "separatore" ? null : null,
    });
  }

  async function addArticoloEmptyAndOpen() {
    const ordine = fractionalOrder(
      blocco.righe.length ? Number(blocco.righe[blocco.righe.length - 1].ordine ?? 0) : null,
      null,
    );
    try {
      const nuova = await insertRiga({
        blocco_id: blocco.id,
        tipo_riga: "articolo_singolo",
        ordine,
        segno: 1,
        quantita: 1,
        sconto_perc: 0,
      });
      setPendingPickerId(nuova.id);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }



  // FM65: articolo dal catalogo Gamma, prezzo dal motore del cliente (nessun ricalcolo in TS).
  async function scegliArticoloGamma(r: Riga, a: ArticoloGammaScelto) {
    const quantita = Number(r.quantita ?? 1) || 1;
    const dedicato = cantiereId ? (await qc.fetchQuery(opzioniPrezziCantiere(cantiereId))).find(p => p.cod_gamma === a.codice) : null;
    let prezzo = null;
    if (condizioniPrezzi.listino_rif != null || condizioniPrezzi.cliente_id) {
      try {
        prezzo = await fetchPrezzoPreventivoArticolo(condizioniPrezzi, a.codice);
      } catch (e) {
        if (!dedicato) toast.warning(`Prezzo non disponibile: ${(e as Error).message}`);
      }
    }
    upd.mutate({
      id: r.id,
      patch: campiRigaGammaPreventivo(r, a, quantita, scontoPiede, prezzo, dedicato),
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocco.righe.findIndex((r) => r.id === active.id);
    const newIdx = blocco.righe.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = [...blocco.righe];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    reorderRighe(reordered.map((r, i) => ({ id: r.id, ordine: (i + 1) * 10 }))).then(invalidate);
  }

  const righeProps = (r: (typeof blocco.righe)[number], idx: number) => ({
    row: r, linea, tipoDocumento, fornitoreModificabile, solaLetturaGamma,
    fornitore: fornitori.data?.get(r.id) ?? null, fornitoreCaricamento: fornitori.isPending, fornitoreErrore: !!fornitori.error,
    onFornitore: async (id: string) => { await salvaFornitore.mutateAsync({ id: r.id, fornitoreId: id }); },
    conMisure, righeStampabili, conBs, articoloInDefinizione, gamma, mostraEvasione,
    prezzoCantiere: segnoPrezzoCantiere(r, dedicati.get(r.articolo_codice ?? r.articolo?.cod_gamma ?? "")),
    idx,
    fascia,
    readOnly,
    preventivoId, sedeGiacenzaId, sedeNome, cantiereId,
    autoOpenPicker: r.id === pendingPickerId,
    onOpenArticolo: (aid: string) => setOpenArticoloId(aid),
    onOpenRiepilogo: clienteId || condizioniPrezzi.listino_rif != null ? () => setRiepilogoRigaId(r.id) : null,
    calc: calcMap.get(r.id) ?? { importo: 0, costo: 0, vendita: 0, margine_perc: 0, peso: 0, importoEffettivo: 0 },
    onPatch: (patch: Parameters<typeof updateRiga>[1]) =>
      upd.mutate({ id: r.id, patch }),
    onSceltaGamma: (a: ArticoloGammaScelto) => scegliArticoloGamma(r, a),
    onDelete: () => del.mutate(r.id),
    onAddAbove: (tipo: TipoRiga) => {
      ins.mutate({ blocco_id: blocco.id, tipo_riga: tipo, ordine: ordineAround(idx, "above"), segno: 1 });
    },
    onAddBelow: (tipo: TipoRiga) => {
      ins.mutate({ blocco_id: blocco.id, tipo_riga: tipo, ordine: ordineAround(idx, "below"), segno: 1 });
    },
  });

  const margineTot = margineTotaliRighe(calcs).perc;

  return (
    <div>
      {!readOnly && conMisure && Number(blocco.quantita_base ?? 0) <= 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground">Imposta la quantità del blocco per usare l’incidenza</p>
      )}
      {/* Da 1024 px: tabella. Sotto: schede compatte con gli stessi campi. */}
      <div className="hidden max-w-full overflow-x-auto pv-tabella:block">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className={cn("w-full table-fixed", tabellaKit ? "[&_th]:!w-auto [&_th]:!static [&_td]:!static [&_th]:whitespace-normal [&_td]:break-words" : !gamma ? (conMisure ? "min-w-[1326px]" : "min-w-[1266px]") : conMisure ? "min-w-[1470px]" : "min-w-[1410px]", "border-separate border-spacing-0 text-xs")}>
          {tabellaKit && <colgroup>{['w-[1%]', 'w-[3%]', 'w-[10%]', 'w-[19%]', 'w-[4%]', 'w-[5%]', 'w-[5%]', ...(mostraEvasione ? ['w-[10%]'] : []), 'w-[6%]', 'w-[4%]', 'w-[4%]', 'w-[4%]', 'w-[6%]', 'w-[3%]', 'w-[7%]', 'w-[5%]', 'w-[5%]', 'w-[4%]', 'w-[5%]'].map((c, i) => <col key={i} className={c}/>)}</colgroup>}
          <thead>
            <tr className="whitespace-nowrap bg-pv-testa text-[10px] uppercase tracking-wide text-muted-foreground [&>th]:bg-pv-testa [&>th]:border-b">
              <th className="w-[18px] px-1 py-1.5 sticky left-0 z-10"></th>
              <th className="w-[48px] px-1 py-1.5 text-center sticky left-[18px] z-10 tablet:w-[64px]">#</th>
              <th className="w-[156px] px-1 py-1.5 text-left sticky left-[66px] z-10 tablet:left-[82px] tablet:w-[140px]">Codice</th>
              <th className="px-1 py-1.5 text-left lg:sticky lg:left-[222px] lg:z-10">Descrizione</th>
              <th className="w-[64px] px-1 py-1.5 text-left">U.M.</th>
              {conMisure && <th className="w-[60px] px-1 py-1.5 text-right">Incid.</th>}
              <th className="w-[76px] px-1 py-1.5 text-right">Quantità</th>
              {mostraEvasione && <th className="w-[160px] px-1 py-1.5 text-right">Evasione</th>}
              <th className="w-[84px] px-1 py-1.5 text-right">Prezzo lordo</th>
              <th className="w-[68px] px-1 py-1.5 text-right">Sconti</th>
              {gamma ? <>
              <th className="w-[52px] px-1 py-1.5 text-right">Magg.%</th>
              <th className="w-[60px] px-1 py-1.5 text-right" title="Sconto extra %">Extra %</th>
              </> : <th className="w-[64px] px-1 py-1.5 text-right" title="Ricarico sul costo">Ricarico %</th>}
              <th className="w-[84px] px-1 py-1.5 text-right">Netto</th>
              {gamma && <th className="w-[44px] px-1 py-1.5 text-center">±</th>}
              <th className="w-[96px] px-1 py-1.5 text-right">Importo</th>
              <th className="w-[76px] px-1 py-1.5 text-right">Costo</th>
              <th className="w-[60px] px-1 py-1.5 text-right">Marg.%</th>
              {gamma && <th className="w-[52px] px-1 py-1.5 text-right">Peso</th>}
              <th className="w-[60px] px-1 py-1.5"></th>
            </tr>
          </thead>
          <SortableContext items={blocco.righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {blocco.righe.length === 0 ? (
                <tr>
                  <td colSpan={nColonne} className="py-6 text-center text-muted-foreground">
                    Nessuna riga. Aggiungi la prima.
                  </td>
                </tr>
              ) : (
                blocco.righe.map((r, idx) => <RigaRow key={r.id} {...righeProps(r, idx)} />)
              )}
            </tbody>
          </SortableContext>
          <tfoot>
            <tr className="border-t bg-muted/30 text-xs">
              <td colSpan={nColonne - 5} className="sticky left-0 px-2 py-2">
                <AddRowMenu readOnly={readOnly} onAddArticolo={addArticoloEmptyAndOpen} onPick={(tipo) => addRow(null, tipo)} />
              </td>
              <td className="px-1 py-2 text-right font-mono font-semibold">{importoInTestataBlocco ? <>€ {fmt2(calcs.totale)}</> : <span className="inline-flex flex-col items-end whitespace-nowrap rounded-md bg-primary px-1.5 py-0.5 font-bold text-primary-foreground"><span className="font-sans text-[9px] font-semibold uppercase">Importo</span>€ {fmt2(calcs.totale)}</span>}</td>
              <td className="px-1 py-2 text-right"><span className="inline-flex flex-col items-end rounded-md bg-pv-grigio-tenue px-1.5 py-0.5 font-mono"><span className="font-sans text-[9px] font-semibold uppercase text-muted-foreground">Costo</span>€ {fmt2(calcs.costo)}</span></td>
              <td className="px-1 py-2 text-right"><span className={cn("inline-flex flex-col items-end rounded-md px-1.5 py-0.5 font-mono", margineTot < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}><span className="font-sans text-[9px] font-semibold uppercase">Margine</span>{margineTot.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></td>
              {gamma && <td className="px-1 py-2 text-right font-mono text-muted-foreground">{fmt2(calcs.peso)}</td>}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </DndContext>
      </div>

      <div className="space-y-2 p-2 pv-tabella:hidden">
        {blocco.righe.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">Nessuna riga. Aggiungi la prima.</div>
        )}
        {blocco.righe.map((r, idx) => <RigaScheda key={r.id} {...righeProps(r, idx)} />)}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-sm">
          <AddRowMenu readOnly={readOnly} onAddArticolo={addArticoloEmptyAndOpen} onPick={(tipo) => addRow(null, tipo)} />
          <div className="grid grid-cols-2 gap-x-4 font-mono text-xs">
            {importoInTestataBlocco ? <><span className="text-muted-foreground">Totale</span><span className="text-right font-semibold">€ {fmt2(calcs.totale)}</span></> : <span className="col-span-2 justify-self-end whitespace-nowrap rounded-md bg-primary px-2 py-0.5 font-bold text-primary-foreground">Importo € {fmt2(calcs.totale)}</span>}
            <span className="col-span-2 mt-1 flex flex-wrap justify-end gap-1">
              <span className="whitespace-nowrap rounded-full bg-pv-grigio-tenue px-2 py-0.5">Costo € {fmt2(calcs.costo)}</span>
              <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5", margineTot < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}>Margine {margineTot.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
            </span>
          </div>
        </div>
      </div>

      <ArticoloDettaglioDialog
        articoloId={openArticoloId}
        open={!!openArticoloId}
        onOpenChange={(b) => { if (!b) setOpenArticoloId(null); }}
      />
      {(() => {
        const rr = riepilogoRigaId ? blocco.righe.find((x) => x.id === riepilogoRigaId) : null;
        const cc = rr ? calcMap.get(rr.id) : null;
        return rr?.articolo_codice && (clienteId || condizioniPrezzi.listino_rif != null) && cc ? (
          <RiepilogoArticoloDialog open onOpenChange={(b) => { if (!b) setRiepilogoRigaId(null); }}
            tipoDocumento={tipoDocumento} clienteId={clienteId} condizioni={condizioniPrezzi} codice={rr.articolo_codice} riga={rr} calc={cc} />
        ) : null;
      })()}
    </div>
  );
}

function AddRowMenu({
  onAddArticolo,
  onPick,
  readOnly = false,
}: {
  onAddArticolo: () => void;
  onPick: (tipo: TipoRiga) => void;
  readOnly?: boolean;
}) {
  const secondaryTypes = TIPI_RIGA.filter((t) => t !== "articolo_singolo");
  if (readOnly) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-r-none border-r-0"
              onClick={onAddArticolo}
            >
              <Plus className="mr-1 h-3 w-3" /> Aggiungi riga
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Aggiungi una riga articolo (selettore articolo aperto)</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-l-none px-1.5"
                  aria-label="Scegli tipo di riga"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              Scegli il tipo di riga: Articolo (predefinito), Kit, Riga manuale
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">Altri tipi di riga</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {secondaryTypes.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => onPick(t)}>
                {TIPI_RIGA_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}



type RigaProps = {
  linea: unknown;
  tipoDocumento: string; fornitoreModificabile: boolean; fornitore: FornitoreOrdine | null;
  fornitoreCaricamento: boolean; fornitoreErrore: boolean; onFornitore: (id: string) => Promise<void>;
  mostraEvasione: boolean;
  conMisure: boolean;
  /** FM75 F2c: mostra il flag Stampabile (solo linee che lo prevedono). */
  righeStampabili: boolean;
  /** FM75 F3c: toggle e badge BS (linea regimiIva + regime agevolata_10_bs). */
  conBs: boolean;
  /** FM75 F4b: matita e codice fornitore sulla riga manuale. */
  articoloInDefinizione: boolean;
  onApriDefinizione?: () => void;
  /** Colonne Gamma (Magg.%, Extra %, ±, Peso) oppure Ricarico % (catalogo linee). */
  gamma: boolean;
  prezzoCantiere: boolean;
  row: BloccoConRighe["righe"][number];
  idx: number;
  calc: ReturnType<typeof calcolaBlocco>["righe"][number]["calc"];
  fascia: FasciaListino;
  readOnly: boolean;
  solaLetturaGamma: boolean;
  /** FM65 F4: memoria dei filtri del selettore articolo. */
  preventivoId: string;
  sedeGiacenzaId?: string | null; sedeNome?: string | null;
  autoOpenPicker?: boolean;
  cantiereId?: string | null;
  onOpenArticolo: (id: string) => void;
  /** FM65 punto 4: null se il preventivo non ha cliente. */
  onOpenRiepilogo?: (() => void) | null;
  onPatch: (patch: Parameters<typeof updateRiga>[1]) => void;
  onSceltaGamma: (a: ArticoloGammaScelto) => void;
  onDelete: () => void;
  onAddAbove: (tipo: TipoRiga) => void;
  onAddBelow: (tipo: TipoRiga) => void;
};

const fmt4 = (v: number) => formatNumeroIt(v, { minDecimals: 4, maxDecimals: 4 });
const fmt2 = (v: number) => formatNumeroIt(v, { minDecimals: 2, maxDecimals: 2 });

function ScontiCell({ value, onCommit }: { value: number[] | null | undefined; onCommit: (v: number[]) => void }) {
  const testo = formatScontiGamma(value);
  const [local, setLocal] = useState(testo);
  useEffect(() => setLocal(testo), [testo]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder="—"
      aria-label="Sconti Gamma (es. 17+5)"
      title="Sconti in cascata separati da + (massimo 6)"
      onChange={(e) => setLocal(e.target.value.replace(/[^0-9.,+\s]/g, ""))}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (local.trim() === testo) return;
        const v = parseScontiGamma(local);
        if (v == null) {
          toast.error("Sconti non validi: scrivi i valori separati da + (massimo 6), es. 17+5");
          setLocal(testo);
          return;
        }
        onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") { setLocal(testo); (e.currentTarget as HTMLInputElement).blur(); }
      }}
      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right font-mono text-xs outline-none hover:border-input focus:border-ring focus:bg-card"
    />
  );
}

/**
 * FM65 punto 4: <span role="button"> e non <button>, perché il Corpo in sola lettura sta in
 * <fieldset disabled>, che disattiva i <button> ma non gli altri elementi.
 */
function PulsanteRiepilogo({ idx, onOpen, inTabella }: { idx: number; onOpen: (() => void) | null; inTabella?: boolean }) {
  const apri = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); onOpen?.(); };
  return <span role="button" tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen || undefined}
    aria-label={`Riepilogo articolo riga ${idx + 1}`} title={onOpen ? "Riepilogo articolo" : "Scegli il cliente o imposta le condizioni di riferimento"}
    onClick={onOpen ? apri : (e) => e.stopPropagation()}
    onKeyDown={(e) => { if (onOpen && (e.key === "Enter" || e.key === " ")) apri(e); }}
    className={cn("grid shrink-0 place-items-center rounded-md text-pv-blu", inTabella ? "size-7 lg:size-5 tablet:size-10 tablet:lg:size-10" : "size-10",
      onOpen ? "cursor-pointer hover:bg-pv-azzurro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "cursor-not-allowed opacity-40")}>
    <Info className="size-4 lg:size-3.5" aria-hidden />
  </span>;
}

/** Fixed number and detail slots, also for rows without a Gamma article. */
function NumeroRiga({ p, inTabella = false }: { p: RigaProps; inTabella?: boolean }) {
  return <div className={cn("grid shrink-0 items-center gap-0.5 text-xs text-muted-foreground", inTabella ? "min-h-[26px] grid-cols-[20px_20px] tablet:grid-cols-[18px_40px]" : "grid-cols-[24px_40px]")}>
    <span className="text-center font-mono tabular-nums">{p.idx + 1}</span>
    <span className={cn("flex items-center justify-center", inTabella ? "size-5 tablet:size-10" : "size-10")}>
      {p.row.articolo_codice && <PulsanteRiepilogo idx={p.idx} onOpen={p.onOpenRiepilogo ?? null} inTabella={inTabella} />}
    </span>
  </div>;
}

/** La descrizione va a capo e cresce col testo (fallback dove field-sizing non è supportato). */
function adattaAltezza(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function useCelleRiga(p: RigaProps) {
  const { row, calc, readOnly, preventivoId, autoOpenPicker = false, onOpenArticolo, onPatch, onSceltaGamma } = p;
  const tipo = row.tipo_riga;
  const intestazioneKit = isIntestazioneKit(row);
  const kitSenzaPrezzo = tipo === "da_kit" && !intestazioneKit && (row.prezzo_unit == null || !row.articolo_codice);
  const isCompact = tipo === "nota" || tipo === "separatore" || intestazioneKit;
  const isSubtotal = tipo === "sotto_totale";
  const valorizzata = !isCompact && !isSubtotal;
  const nettoModificabile = nettoShowroomModificabile(p.linea, valorizzata, readOnly || p.solaLetturaGamma);
  const isText = tipo === "nota";
  const segno = (row.segno ?? 1) === -1 ? -1 : 1;
  const q = Number(row.quantita ?? 0);
  const vecchioCatalogo = !!row.articolo_id;
  const prezzoMancante = !!row.articolo_codice && row.prezzo_unit == null;

  const unita = rigaInUnita(row, row.unita_gamma);
  const salvaInUnita = (patch: Parameters<typeof rigaInUnita>[2]) => onPatch(rigaInUnita(row, row.unita_gamma, patch).patchUm1);
  const codice = valorizzata && tipo !== "manuale" ? (
    <div className="flex min-w-0 items-center gap-0.5">
      <div className="min-w-0 flex-1">
        <ArticoloGammaPicker soloCodice autoOpen={autoOpenPicker} preventivoId={preventivoId} sedeGiacenzaId={p.sedeGiacenzaId} sedeNome={p.sedeNome} cantiereId={p.cantiereId}
          codice={row.articolo_codice ?? row.articolo?.cod_gamma ?? null}
          descrizione={row.descrizione} onChange={onSceltaGamma} disabled={readOnly} />
      </div>
    </div>
  ) : valorizzata && p.articoloInDefinizione && !readOnly ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); p.onApriDefinizione?.(); }}
      title="Apri articolo in definizione" aria-label={`Apri articolo in definizione riga ${p.idx + 1}`}
      className="block min-h-[26px] w-full break-all rounded px-1 py-1 text-left font-mono text-xs text-pv-blu underline decoration-dotted underline-offset-2 hover:bg-pv-azzurro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {row.codice_articolo_fornitore || "MANUALE"}
    </button>
  ) : valorizzata ? <span className="block break-all px-1 py-2 font-mono text-xs">{(p.articoloInDefinizione && row.codice_articolo_fornitore) || "MANUALE"}</span> : null;
  const articolo = (
    <>
      {row.ruolo_kit && <span className="mb-0.5 block px-1.5 text-xs text-muted-foreground">{row.ruolo_kit}</span>}
      <textarea key={`${row.id}-${row.descrizione ?? ""}`} defaultValue={row.descrizione ?? ""}
        aria-label="Descrizione riga" disabled={readOnly} rows={1}
        ref={adattaAltezza} onInput={(e) => adattaAltezza(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onBlur={(e) => { if ((e.target.value || null) !== row.descrizione) onPatch({ descrizione: e.target.value || null }); }}
        className="block min-h-[26px] w-full min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words rounded border border-transparent bg-transparent px-1.5 py-1 font-sans text-xs leading-4 shadow-none outline-none [field-sizing:content] hover:border-input focus:border-ring focus:bg-card focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50" placeholder={isText ? "Nota libera…" : isSubtotal ? "Sotto-totale" : "Descrizione…"} />
      {p.tipoDocumento === 'ordine' && valorizzata && tipo !== 'manuale' && row.articolo_codice && <FornitoreRigaOrdine codice={row.articolo_codice} fornitore={p.fornitore} modificabile={p.fornitoreModificabile && !p.fornitoreCaricamento && (p.fornitore === null || p.fornitore.cambiabile !== false)} caricamento={p.fornitoreCaricamento} errore={p.fornitoreErrore} onSave={p.onFornitore} />}
      {prezzoMancante && <span role="alert" className="mt-0.5 block font-sans text-[11px] font-semibold text-destructive">Prezzo non disponibile: inseriscilo a mano</span>}
    </>
  );

  const evasa = statoEvasioneRiga(row).stato === "evasa";

  const celle = {
    tipo, isCompact, isSubtotal, valorizzata, segno, kitSenzaPrezzo, nettoModificabile,
    articolo,
    codice,
    um: row.articolo_codice || unita.convertibile ? <CellaUm idx={p.idx} um1={unita.um1 ?? unita.um ?? row.um ?? "—"} um2={unita.convertibile ? unita.um2 ?? null : null}
      fattore={unita.fattore} secondaria={!!unita.secondaria} disabled={readOnly}
      onChange={(um_scelta) => onPatch({ um_scelta })} /> : (
      <CellaUm idx={p.idx} um1={row.um ?? ""} um2={null} fattore={null} secondaria={false} disabled={readOnly}
        onChange={() => {}} onManualCommit={(um) => onPatch({ um })} />
    ),
    incidenza: (
      <EditableNumberCell value={unita.incidenza} decimali={4} ariaLabel="Incidenza"
        onCommit={(v) => salvaInUnita({ incidenza: v })} />
    ),
    quantita: (
      <EditableNumberCell value={unita.quantita} decimali={2} ariaLabel="Quantità riga"
        onCommit={(v) => salvaInUnita({ quantita: v })} {...(evasa ? { disabled: true } : {})} />
    ),
    lordo: (
      <span className={cn("relative block", p.prezzoCantiere && "text-pv-verde [&_input]:text-pv-verde")} title={p.prezzoCantiere ? "Prezzo cantiere" : undefined}>
        {p.prezzoCantiere && <span aria-hidden className="pointer-events-none absolute left-0 top-1/2 size-1 -translate-y-1/2 rounded-full bg-pv-verde" />}
        <EditableNumberCell value={unita.prezzo_unit} decimali={4}
          onCommit={(v) => salvaInUnita({ prezzo_unit: v })} />
      </span>
    ),
    sconti: <ScontiCell value={row.sconti_gamma} onCommit={(v) => onPatch({ sconti_gamma: v })} />,
    magg: (
      <EditableNumberCell value={Number(row.maggiorazione_perc ?? 0) || null}
        onCommit={(v) => onPatch({ maggiorazione_perc: v ?? 0 })} />
    ),
    extra: (
      <EditableNumberCell value={row.sconto_perc == null ? null : Number(row.sconto_perc) || null}
        onCommit={(v) => onPatch({ sconto_perc: v ?? 0 })} />
    ),
    netto: nettoModificabile ? <EditableNumberCell value={unita.netto} decimali={4} ariaLabel="Netto"
      onCommit={(v) => {
        if (v == null) { toast.error("Netto non valido"); return; }
        const nettoUm1 = rigaInUnita(row, row.unita_gamma, { prezzo_unit: v }).patchUm1.prezzo_unit;
        if (nettoUm1 == null) { toast.error("Netto non valido"); return; }
        const patch = levaDaNetto({ nettoUm1, prezzoUnit: row.prezzo_unit, sconti: row.sconti_gamma,
          maggiorazionePerc: row.maggiorazione_perc, scontoPerc: row.sconto_perc,
          costoUnit: costoUnitRiga(row), levaAttuale: row.leva_prezzo });
        if (!patch) { toast.error("Netto non valido"); return; }
        // La leva ha già lavorato in UM1: non riconvertire il prezzo una seconda volta.
        onPatch(patch);
      }} /> : row.prezzo_unit == null ? "—" : fmt4(unita.netto ?? 0),
    /** FM75: leva ricarico in riga, stesso applicaLeva della finestra riga (scrive prezzo e azzera gli sconti). */
    ricarico: (
      <EditableNumberCell ariaLabel="Ricarico %" decimali={2}
        value={row.leva_prezzo === "ricarico" && row.ricarico != null ? Number(row.ricarico)
          : row.prezzo_unit == null ? null : ricaricoImplicito(unita.netto ?? 0, unita.costo_unit)}
        onCommit={(v) => {
          const patch = applicaLeva({ leva: "ricarico", costoUnit: unita.costo_unit, ricaricoPerc: v });
          if (!patch) { toast.error("Per applicare il ricarico serve il costo della riga"); return; }
          onPatch({ ...patch, ...rigaInUnita(row, row.unita_gamma, { prezzo_unit: patch.prezzo_unit }).patchUm1 });
        }} />
    ),
    segnoSel: (
      <Select value={String(segno)} onValueChange={(v) => onPatch({ segno: Number(v) === -1 ? -1 : 1 })}>
        <SelectTrigger className="h-8 w-10 px-1 text-xs" aria-label="Segno"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="1">+</SelectItem>
          <SelectItem value="-1">−</SelectItem>
        </SelectContent>
      </Select>
    ),
    importo: `€ ${fmt2(isSubtotal ? calc.importoEffettivo : calc.importo)}`,
    costo: (
      <EditableNumberCell value={unita.costo_unit}
        decimali={4}
        onCommit={(v) => salvaInUnita({ costo_unit: v })} />
    ),
    margine: `${calc.margine_perc.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
    /** FM75 F5b + F6: margine € di riga (importo − costo), su tutte le linee. */
    margineEuro: `€ ${fmt2(calc.importo - calc.costo)}`,
    peso: row.articolo_codice && row.peso_gamma_unit == null ? "—" : fmt2(calc.peso),
    onRowClick: readOnly && vecchioCatalogo ? () => row.articolo_id && onOpenArticolo(row.articolo_id) : undefined,
  };
  if (!p.solaLetturaGamma) return celle;
  const numero = (v: number | null | undefined, decimali = 4) => v == null ? "—" : formatNumeroIt(v, { minDecimals: decimali, maxDecimals: decimali });
  return { ...celle,
    codice: valorizzata ? <span className="block break-all py-1 font-mono text-xs">{row.articolo_codice ?? row.codice_articolo_fornitore ?? "MANUALE"}</span> : null,
    articolo: <div className="whitespace-pre-wrap break-words px-1.5 py-1 text-xs">{row.descrizione ?? "—"}{p.fornitore && <span className="mt-1 block text-muted-foreground">{p.fornitore.ragione_sociale}</span>}</div>,
    um: unita.um ?? row.um ?? "—", quantita: numero(unita.quantita, 2), incidenza: numero(unita.incidenza), lordo: numero(unita.prezzo_unit),
    sconti: (row.sconti_gamma ?? []).map(v => formatNumeroIt(v)).join("+") || "—", magg: numero(row.maggiorazione_perc), extra: numero(row.sconto_perc),
    ricarico: numero(row.leva_prezzo === "ricarico" && row.ricarico != null ? Number(row.ricarico) : row.prezzo_unit == null ? null : ricaricoImplicito(unita.netto ?? 0, unita.costo_unit), 2), segnoSel: segno === -1 ? "−" : "+", costo: numero(unita.costo_unit),
  };
}

function BadgeMargine({ perc, testo }: { perc: number; testo: React.ReactNode }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-xs font-semibold",
    perc < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}>{testo}</span>;
}

/**
 * Unico punto che decide lo sfondo di una riga del corpo. Colori opachi (mescolati con card)
 * applicati a TUTTE le celle, sticky comprese, così la riga non resta mai "a metà".
 * Le righe manuali restano bianche come gli articoli.
 */
type TonoRiga = "card" | "sottototale" | "separatore" | "nota" | "kit";
function tonoRiga(c: { tipo: string; isSubtotal: boolean; kitSenzaPrezzo: boolean }): TonoRiga {
  if (c.kitSenzaPrezzo) return "kit";
  if (c.isSubtotal) return "sottototale";
  if (c.tipo === "separatore") return "separatore";
  if (c.tipo === "nota") return "nota";
  return "card";
}
const SFONDO_CELLE: Record<TonoRiga, string> = {
  card: "[&>td]:bg-card",
  sottototale: "[&>td]:bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))]",
  separatore: "[&>td]:bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-card))]",
  nota: "[&>td]:bg-[color-mix(in_oklab,var(--color-muted)_20%,var(--color-card))]",
  kit: "[&>td]:bg-[color-mix(in_oklab,var(--color-destructive)_10%,var(--color-card))]",
};
const SFONDO_SCHEDA: Record<TonoRiga, string> = {
  card: "bg-card",
  sottototale: "bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))]",
  separatore: "bg-[color-mix(in_oklab,var(--color-muted)_30%,var(--color-card))]",
  nota: "bg-[color-mix(in_oklab,var(--color-muted)_20%,var(--color-card))]",
  kit: "bg-[color-mix(in_oklab,var(--color-destructive)_10%,var(--color-card))]",
};
const HOVER_CELLE = "hover:[&>td]:bg-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-card))]";
function sfondoRiga(c: Parameters<typeof tonoRiga>[0] & { onRowClick?: unknown }) {
  return cn(SFONDO_CELLE[tonoRiga(c)], !!c.onRowClick && HOVER_CELLE);
}
function sfondoScheda(c: Parameters<typeof tonoRiga>[0]) {
  return SFONDO_SCHEDA[tonoRiga(c)];
}

/** FM75 F2c: la riga è nascosta in stampa (solo se la linea prevede il flag). */
function rigaNascosta(p: RigaProps) {
  return p.righeStampabili && p.row.stampabile === false;
}

function ToggleStampabile(p: RigaProps & { valorizzata: boolean }) {
  if (!p.righeStampabili || !p.valorizzata || isRaccoglitorePosa(p.row.articolo_codice)) return null;
  const stampabile = p.row.stampabile !== false;
  const etichetta = stampabile ? "Stampabile: sì (clic per nascondere)" : "Stampabile: no (clic per mostrare)";
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={p.readOnly}
      onClick={(e) => { e.stopPropagation(); p.onPatch({ stampabile: !stampabile }); }}
      title={etichetta} aria-label={etichetta} aria-pressed={!stampabile}>
      {stampabile ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
    </Button>
  );
}

function ToggleBs(p: RigaProps & { valorizzata: boolean }) {
  if (!p.conBs || !p.valorizzata) return null;
  const bs = !!p.row.bene_significativo;
  const etichetta = bs ? "Bene significativo: sì (clic per togliere)" : "Bene significativo: no (clic per indicarlo)";
  return (
    <Button size="icon" variant="ghost" className={cn("h-8 w-8 text-[10px] font-bold", bs ? "text-pv-viola" : "text-muted-foreground")} disabled={p.readOnly}
      onClick={(e) => { e.stopPropagation(); p.onPatch({ bene_significativo: !bs }); }}
      title={etichetta} aria-label={etichetta} aria-pressed={bs}>
      BS
    </Button>
  );
}

function BadgeBs({ p, valorizzata }: { p: RigaProps; valorizzata: boolean }) {
  if (!p.conBs || !valorizzata || !p.row.bene_significativo) return null;
  return <span className="mt-0.5 inline-block rounded border border-pv-viola/30 bg-pv-viola-tenue px-1 text-[10px] font-semibold text-pv-viola" title="Bene significativo">BS</span>;
}

/** Finestra "articolo in definizione": si apre dal codice della riga manuale (linee con articoloInDefinizione). */
function useArticoloInDefinizione(p: RigaProps) {
  const [open, setOpen] = useState(false);
  const attivo = !p.solaLetturaGamma && p.articoloInDefinizione && p.row.tipo_riga === "manuale";
  const dialog = attivo && open ? <ArticoloInDefinizioneDialog open onOpenChange={setOpen} row={p.row} onPatch={p.onPatch} onSceltaGamma={p.onSceltaGamma} /> : null;
  return { apri: attivo ? () => setOpen(true) : undefined, dialog };
}

function AzioniRiga(p: RigaProps & { valorizzata?: boolean }) {
  const isTablet = useIsTablet();
  if (p.solaLetturaGamma) return null;
  // FM81, solo tablet: BS, stampabile ed elimina passano nel menu "⋯", così la colonna resta larga 60px senza sovrapposizioni.
  if (isTablet) return (
    <div className="flex items-center justify-end">
      <RowActions onAddAbove={p.onAddAbove} onAddBelow={p.onAddBelow}
        onChangeType={(t) => p.onPatch({ tipo_riga: t })} currentType={p.row.tipo_riga} extra={<VociTabletRiga {...p} valorizzata={!!p.valorizzata} />} />
    </div>
  );
  return (
    <div className="flex items-center justify-end gap-0.5">
      <ToggleBs {...p} valorizzata={!!p.valorizzata} />
      <ToggleStampabile {...p} valorizzata={!!p.valorizzata} />
      <Button size="icon" variant="ghost"
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={p.onDelete} title="Elimina riga" aria-label="Elimina riga">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <RowActions onAddAbove={p.onAddAbove} onAddBelow={p.onAddBelow}
        onChangeType={(t) => p.onPatch({ tipo_riga: t })} currentType={p.row.tipo_riga} />
    </div>
  );
}

function RigaRow(p: RigaProps) {
  const def = useArticoloInDefinizione(p);
  p = { ...p, onApriDefinizione: def.apri };
  const sortable = useSortable({ id: p.row.id, disabled: p.solaLetturaGamma });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging || rigaNascosta(p) ? 0.5 : 1,
  };
  const c = useCelleRiga(p);
  const rowClass = cn(
    "border-b font-mono align-top whitespace-nowrap [&>td]:border-b tablet:align-middle tablet:[&_input]:min-h-10 tablet:[&_textarea]:min-h-10 tablet:[&_textarea]:py-3 tablet:[&_[role=combobox]]:min-h-10",
    sfondoRiga(c),
    c.isSubtotal && "font-semibold",
    c.tipo === "separatore" && "h-2",
    c.tipo === "nota" && "italic",
    c.onRowClick && "cursor-pointer",
  );
  const grip = (
    <td className="sticky left-0 z-[1]">
      {!p.solaLetturaGamma && <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab px-0.5" title="Trascina">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>}
    </td>
  );
  if (c.tipo === "separatore") {
    return (
      <tr ref={sortable.setNodeRef} style={style} className={rowClass}>
        {grip}
        <td colSpan={(p.gamma ? 15 : 12) + (p.conMisure ? 1 : 0) + (p.mostraEvasione ? 1 : 0)}></td>
        <td className="text-right"><AzioniRiga {...p} /></td>
      </tr>
    );
  }
  const v = c.valorizzata;
  return (
    <tr ref={sortable.setNodeRef} style={style} className={rowClass} onClick={c.onRowClick}>
      {grip}
      <td className="sticky left-[18px] z-[1] py-0.5 text-center text-xs text-muted-foreground"><NumeroRiga p={p} inTabella /></td>
      <td className="sticky left-[66px] z-[1] min-w-0 px-1 py-0.5 tablet:left-[82px]">{c.codice}</td>
      <td className="lg:sticky lg:left-[222px] lg:z-[1] min-w-0 whitespace-normal px-1 py-0.5">{c.articolo}<BadgeBs p={p} valorizzata={c.valorizzata} />{c.kitSenzaPrezzo && (
        <p className="mt-0.5 text-[11px] font-sans not-italic text-destructive">Articolo non collegato a Gamma: inserisci prezzo e costo a mano</p>
      )}</td>
      <td className="px-0.5 py-0.5">{v && c.um}</td>
      {p.conMisure && <td className="px-0.5 py-0.5 text-right">{v && c.incidenza}</td>}
      <td className="px-0.5 py-0.5 text-right">{v && c.quantita}</td>
      {p.mostraEvasione && <td className="px-1 py-1.5 text-right"><CellaEvasione riga={p.row} /></td>}
      <td className="px-0.5 py-0.5 text-right">{v && c.lordo}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.sconti}</td>
      {p.gamma ? <>
      <td className="px-0.5 py-0.5 text-right">{v && c.magg}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.extra}</td>
      </> : <td className="px-0.5 py-0.5 text-right">{v && c.ricarico}</td>}
      <td className="px-1 py-1.5 text-right">{v && c.netto}</td>
      {p.gamma && <td className="px-0.5 py-0.5 text-center">{v && c.segnoSel}</td>}
      <td className={cn("px-1 py-1.5 text-right", c.isSubtotal && "border-y-2 border-primary/40 text-xs",
        p.calc.importoEffettivo < 0 && "text-destructive")}>
        {(v || c.isSubtotal) && c.importo}
      </td>
      <td className="px-0.5 py-0.5 text-right text-muted-foreground">{v && c.costo}</td>
      <td className="px-1 py-1 text-right">{v && <><BadgeMargine perc={p.calc.margine_perc} testo={c.margine} />{c.margineEuro && <span className="block whitespace-nowrap font-mono text-[10px] text-muted-foreground">{c.margineEuro}</span>}</>}</td>
      {p.gamma && <td className="px-1 py-1.5 text-right text-muted-foreground">{v && c.peso}</td>}
      <td className="px-0.5 text-right"><AzioniRiga {...p} valorizzata={v} />{def.dialog}</td>
    </tr>
  );
}

/** Sotto 1024 px: la riga come scheda compatta con gli stessi campi. */
function RigaScheda(p: RigaProps) {
  const def = useArticoloInDefinizione(p);
  p = { ...p, onApriDefinizione: def.apri };
  const c = useCelleRiga(p);
  if (c.tipo === "separatore") {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
        <span>Separatore</span><AzioniRiga {...p} />
      </div>
    );
  }
  const campo = (label: string, node: React.ReactNode, cls?: string, titolo?: string) => (
    <label className={cn("grid min-w-0 gap-0.5", cls)}>
      <span className="text-[11px] text-muted-foreground" title={titolo}>{label}</span>
      <span className="min-w-0 font-mono text-xs">{node}</span>
    </label>
  );
  const valore = (label: string, testo: React.ReactNode, cls?: string) => (
    <div className={cn("grid min-w-0 gap-0.5", cls)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="flex min-h-9 items-center justify-end px-1.5 font-mono text-xs">{testo}</span>
    </div>
  );
  return (
    <div className={cn("rounded-md border p-2", sfondoScheda(c), c.kitSenzaPrezzo && "border-destructive", rigaNascosta(p) && "opacity-50")}
      onClick={c.onRowClick}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-1"><NumeroRiga p={p} /><span className="min-w-0 break-words text-xs text-muted-foreground">{TIPI_RIGA_LABEL[c.tipo]}</span></div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {c.valorizzata && <><span className="whitespace-nowrap font-mono text-xs font-semibold">{c.importo}</span><BadgeMargine perc={p.calc.margine_perc} testo={c.margine} />{c.margineEuro && <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">{c.margineEuro}</span>}</>}
          <AzioniRiga {...p} valorizzata={c.valorizzata} />
        </div>
      </div>
      <div className="min-w-0">
        {c.valorizzata && campo("Codice", c.codice)}
        {campo("Descrizione", <>{c.articolo}<BadgeBs p={p} valorizzata={c.valorizzata} /></>)}
        {c.kitSenzaPrezzo && (
          <p className="mt-0.5 text-[11px] font-sans not-italic text-destructive">Articolo non collegato a Gamma: inserisci prezzo e costo a mano</p>
        )}
      </div>
      {c.valorizzata && (
        <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-4">
          {campo("U.M.", c.um)}
          {campo("Quantità", c.quantita)}
          {p.mostraEvasione && valore("Evasione", <CellaEvasione riga={p.row} />, "col-span-2")}
          {campo("Prezzo lordo", c.lordo)}
          {campo("Sconti", c.sconti)}
          {p.gamma ? campo("Extra %", c.extra, undefined, "Sconto extra %") : campo("Ricarico %", c.ricarico)}
          {c.nettoModificabile ? campo("Netto", c.netto) : valore("Netto", c.netto)}
          {p.conMisure && campo("Incidenza", c.incidenza)}
          {p.gamma && campo("Magg.%", c.magg)}
          {p.gamma && campo("±", c.segnoSel)}
          {campo("Costo unit.", c.costo)}
          {p.gamma && valore("Peso", c.peso)}
        </div>
      )}
      {def.dialog}
      {c.isSubtotal && valore("Sotto-totale", <span className="text-xs font-semibold">{c.importo}</span>)}
    </div>
  );
}

/** FM81, solo tablet: le stesse azioni di ToggleBs, ToggleStampabile ed Elimina, come voci del menu della riga. */
function VociTabletRiga(p: RigaProps & { valorizzata: boolean }) {
  const bsVisibile = p.conBs && p.valorizzata;
  const bs = !!p.row.bene_significativo;
  const stampVisibile = p.righeStampabili && p.valorizzata && !isRaccoglitorePosa(p.row.articolo_codice);
  const stampabile = p.row.stampabile !== false;
  return <>
    {bsVisibile && <DropdownMenuItem disabled={p.readOnly} onClick={(e) => { e.stopPropagation(); p.onPatch({ bene_significativo: !bs }); }}>
      <span className="mr-2 w-4 text-[10px] font-bold text-pv-viola">BS</span>{bs ? "Togli bene significativo" : "Indica bene significativo"}
    </DropdownMenuItem>}
    {stampVisibile && <DropdownMenuItem disabled={p.readOnly} onClick={(e) => { e.stopPropagation(); p.onPatch({ stampabile: !stampabile }); }}>
      {stampabile ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Eye className="mr-2 h-3.5 w-3.5" />}{stampabile ? "Nascondi in stampa" : "Mostra in stampa"}
    </DropdownMenuItem>}
    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); p.onDelete(); }}>
      <Trash2 className="mr-2 h-3.5 w-3.5" /> Elimina riga
    </DropdownMenuItem>
    <DropdownMenuSeparator />
  </>;
}

function RowActions({
  onAddAbove, onAddBelow, onChangeType, currentType, extra,
}: {
  /** FM81: voci aggiuntive in testa al menu, passate solo sul tablet. */
  extra?: React.ReactNode;
  onAddAbove: (t: TipoRiga) => void;
  onAddBelow: (t: TipoRiga) => void;
  onChangeType: (t: TipoRiga) => void;
  currentType: TipoRiga;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 tablet:focus-visible:ring-0" aria-label={extra ? "Azioni riga" : undefined}>
          <span className="text-xs">⋯</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {extra}
        <DropdownMenuLabel className="text-xs">Inserisci sopra</DropdownMenuLabel>
        {TIPI_RIGA.map((t) => (
          <DropdownMenuItem key={`a-${t}`} onClick={() => onAddAbove(t)}>
            <ArrowUp className="mr-2 h-3 w-3" /> {TIPI_RIGA_LABEL[t]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Inserisci sotto</DropdownMenuLabel>
        {TIPI_RIGA.map((t) => (
          <DropdownMenuItem key={`b-${t}`} onClick={() => onAddBelow(t)}>
            <ArrowDown className="mr-2 h-3 w-3" /> {TIPI_RIGA_LABEL[t]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Cambia tipo</DropdownMenuLabel>
        {TIPI_RIGA.filter((t) => t !== currentType).map((t) => (
          <DropdownMenuItem key={`c-${t}`} onClick={() => onChangeType(t)}>
            {TIPI_RIGA_LABEL[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


