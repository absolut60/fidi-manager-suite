import { useEffect, useMemo, useState } from "react";
import { ArticoloDettaglioDialog } from "@/components/preventivatore/ArticoloDettaglioDialog";
import { RiepilogoArticoloDialog } from "@/components/preventivatore/RiepilogoArticoloDialog";
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
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ArticoloPicker } from "@/components/preventivatore/ArticoloPicker";
import { ArticoloGammaPicker, type ArticoloGammaScelto } from "@/components/preventivatore/ArticoloGammaPicker";
import { campiPrezzoDaMotore, costoRiga, formatScontiGamma, isIntestazioneKit, margineTotaliRighe, patchConImporto, parseScontiGamma, prezzoNettoRiga, rigaInUnita } from "@/lib/riga-preventivo";
import {
  calcolaBlocco, deleteRiga, salvaPatchRigaCalcolata, fetchPrezzoClienteArticolo, fractionalOrder, insertRiga, reorderRighe,
  statoPrezzoSpecialeRiga,
  TIPI_RIGA, TIPI_RIGA_LABEL, updateRiga,
  type BloccoConRighe, type PreventivoConDettagli, type PrezziSpecialiMap, type Riga, type RigaUpdate, type TipoRiga,
} from "@/lib/preventivi-api";
import type { FasciaListino } from "@/lib/articoli-api";
import { formatNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function RigheTable({
  blocco,
  preventivoId,
  fascia,
  readOnly = false,
  prezziSpecialiMap,
  clienteId,
  scontoPiede = 0,
}: {
  blocco: BloccoConRighe;
  preventivoId: string;
  fascia: FasciaListino;
  readOnly?: boolean;
  prezziSpecialiMap?: PrezziSpecialiMap | null;
  clienteId: string | null;
  scontoPiede?: number;
}) {
  const [openArticoloId, setOpenArticoloId] = useState<string | null>(null);
  const [pendingPickerId, setPendingPickerId] = useState<string | null>(null);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });

  useEffect(() => {
    if (!pendingPickerId) return;
    const exists = blocco.righe.some((r) => r.id === pendingPickerId);
    if (exists) {
      const t = window.setTimeout(() => setPendingPickerId(null), 600);
      return () => window.clearTimeout(t);
    }
  }, [pendingPickerId, blocco.righe]);



  const calcs = useMemo(() => calcolaBlocco(blocco.righe), [blocco.righe]);
  const [riepilogoRigaId, setRiepilogoRigaId] = useState<string | null>(null);
  const calcMap = useMemo(() => new Map(calcs.righe.map((r) => [r.id, r.calc])), [calcs]);

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
        await salvaPatchRigaCalcolata(id, calcolata, preventivoId, Number(prev.iva_perc ?? 22));
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
  const del = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: (id: string) => deleteRiga(id),
    onSuccess: invalidate,
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
    let prezzo = null;
    if (clienteId) {
      try {
        prezzo = await fetchPrezzoClienteArticolo(clienteId, a.codice);
      } catch (e) {
        toast.warning(`Prezzo non disponibile: ${(e as Error).message}`);
      }
    }
    upd.mutate({
      id: r.id,
      patch: {
        articolo_codice: a.codice,
        articolo_id: null,
        um_scelta: "um1",
        descrizione: a.descrizione,
        um: a.um ?? prezzo?.um ?? null,
        quantita,
        vendita: null,
        ...campiPrezzoDaMotore(prezzo, quantita, scontoPiede),
      },
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
    row: r,
    idx,
    fascia,
    readOnly,
    autoOpenPicker: r.id === pendingPickerId,
    onOpenArticolo: (aid: string) => setOpenArticoloId(aid),
    onOpenRiepilogo: clienteId ? () => setRiepilogoRigaId(r.id) : null,
    prezziSpecialiMap: prezziSpecialiMap ?? null,
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
      {!readOnly && Number(blocco.quantita_base ?? 0) <= 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground">Imposta la quantità del blocco per usare l’incidenza</p>
      )}
      {/* Da 1024 px: tabella. Sotto: schede compatte con gli stessi campi. */}
      <div className="hidden max-w-full overflow-x-auto lg:block">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className="w-full min-w-[1470px] table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="whitespace-nowrap bg-pv-testa text-[10px] uppercase tracking-wide text-muted-foreground [&>th]:bg-pv-testa [&>th]:border-b">
              <th className="w-[18px] px-1 py-1.5 sticky left-0 z-10"></th>
              <th className="w-[40px] px-1 py-1.5 text-center sticky left-[18px] z-10">#</th>
              <th className="w-[156px] px-1 py-1.5 text-left sticky left-[58px] z-10">Codice</th>
              <th className="px-1 py-1.5 text-left sticky left-[214px] z-10 border-r">Descrizione</th>
              <th className="w-[72px] px-1 py-1.5 text-left">U.M.</th>
              <th className="w-[72px] px-1 py-1.5 text-right">Incid.</th>
              <th className="w-[76px] px-1 py-1.5 text-right">Quantità</th>
              <th className="w-[84px] px-1 py-1.5 text-right">Prezzo lordo</th>
              <th className="w-[68px] px-1 py-1.5 text-right">Sconti</th>
              <th className="w-[60px] px-1 py-1.5 text-right">Magg.%</th>
              <th className="w-[76px] px-1 py-1.5 text-right">Sc. extra %</th>
              <th className="w-[84px] px-1 py-1.5 text-right">Netto</th>
              <th className="w-[50px] px-1 py-1.5 text-center">±</th>
              <th className="w-[96px] px-1 py-1.5 text-right">Importo</th>
              <th className="w-[84px] px-1 py-1.5 text-right">Costo</th>
              <th className="w-[60px] px-1 py-1.5 text-right">Marg.%</th>
              <th className="w-[60px] px-1 py-1.5 text-right">Peso</th>
              <th className="w-[66px] px-1 py-1.5"></th>
            </tr>
          </thead>
          <SortableContext items={blocco.righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {blocco.righe.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-6 text-center text-muted-foreground">
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
              <td colSpan={13} className="sticky left-0 px-2 py-2">
                <AddRowMenu readOnly={readOnly} onAddArticolo={addArticoloEmptyAndOpen} onPick={(tipo) => addRow(null, tipo)} />
              </td>
              <td className="px-1 py-2 text-right font-mono font-semibold">€ {fmt2(calcs.totale)}</td>
              <td className="px-1 py-2 text-right"><span className="inline-flex flex-col items-end rounded-md bg-pv-grigio-tenue px-1.5 py-0.5 font-mono"><span className="font-sans text-[9px] font-semibold uppercase text-muted-foreground">Costo</span>€ {fmt2(calcs.costo)}</span></td>
              <td className="px-1 py-2 text-right"><span className={cn("inline-flex flex-col items-end rounded-md px-1.5 py-0.5 font-mono", margineTot < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}><span className="font-sans text-[9px] font-semibold uppercase">Margine</span>{margineTot.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span></td>
              <td className="px-1 py-2 text-right font-mono text-muted-foreground">{fmt2(calcs.peso)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </DndContext>
      </div>

      <div className="space-y-2 p-2 lg:hidden">
        {blocco.righe.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">Nessuna riga. Aggiungi la prima.</div>
        )}
        {blocco.righe.map((r, idx) => <RigaScheda key={r.id} {...righeProps(r, idx)} />)}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-sm">
          <AddRowMenu readOnly={readOnly} onAddArticolo={addArticoloEmptyAndOpen} onPick={(tipo) => addRow(null, tipo)} />
          <div className="grid grid-cols-2 gap-x-4 font-mono text-xs">
            <span className="text-muted-foreground">Totale</span><span className="text-right font-semibold">€ {fmt2(calcs.totale)}</span>
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
        return rr?.articolo_codice && clienteId && cc ? (
          <RiepilogoArticoloDialog open onOpenChange={(b) => { if (!b) setRiepilogoRigaId(null); }}
            clienteId={clienteId} codice={rr.articolo_codice} riga={rr} calc={cc} />
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
  row: BloccoConRighe["righe"][number];
  idx: number;
  calc: ReturnType<typeof calcolaBlocco>["righe"][number]["calc"];
  fascia: FasciaListino;
  readOnly: boolean;
  autoOpenPicker?: boolean;
  onOpenArticolo: (id: string) => void;
  /** FM65 punto 4: null se il preventivo non ha cliente. */
  onOpenRiepilogo?: (() => void) | null;
  onPatch: (patch: Parameters<typeof updateRiga>[1]) => void;
  onSceltaGamma: (a: ArticoloGammaScelto) => void;
  onDelete: () => void;
  onAddAbove: (tipo: TipoRiga) => void;
  onAddBelow: (tipo: TipoRiga) => void;
  prezziSpecialiMap?: PrezziSpecialiMap | null;
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

/** Cella U.M. compatta (UM1 blu, UM2 arancio); i valori restano salvati in UM1. */
function CellaUm({ idx, um1, um2, fattore, secondaria, disabled, onChange }: {
  idx: number; um1: string; um2: string | null; fattore: number | null; secondaria: boolean; disabled: boolean; onChange: (v: "um1" | "um2") => void;
}) {
  const inUm2 = secondaria && !!um2;
  const box = "flex h-auto min-h-[26px] w-full items-center justify-between gap-0.5 rounded border border-transparent bg-transparent px-1 py-1 text-left text-xs leading-none shadow-none hover:border-input focus:border-ring focus:bg-card focus-visible:ring-0 [&>svg]:size-3 [&>svg]:shrink-0";
  const testo = (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="whitespace-nowrap font-sans text-xs font-bold text-foreground">{inUm2 ? um2 : um1}</span>
      <span className={cn("font-sans text-[8px] font-semibold uppercase", inUm2 ? "text-pv-arancio" : "text-pv-blu")}>{inUm2 ? "UM2" : "UM1"}</span>
    </div>
  );
  const label = `Unità di misura riga ${idx + 1}`;
  if (!um2) return <div className={box} aria-label={label} role="group">{testo}</div>;
  return (
    <Select value={inUm2 ? "um2" : "um1"} disabled={disabled} onValueChange={(v) => onChange(v as "um1" | "um2")}>
      <SelectTrigger aria-label={label} className={box}>{testo}</SelectTrigger>
      <SelectContent>
        <SelectItem value="um1">{`${um1} – unità 1 (primaria)`}</SelectItem>
        <SelectItem value="um2">{`${um2} – unità 2 (secondaria)${fattore ? ` · 1 ${um2} = ${formatNumeroIt(fattore, { maxDecimals: 4 })} ${um1}` : ""}`}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * FM65 punto 4: <span role="button"> e non <button>, perché il Corpo in sola lettura sta in
 * <fieldset disabled>, che disattiva i <button> ma non gli altri elementi.
 */
function PulsanteRiepilogo({ idx, onOpen }: { idx: number; onOpen: (() => void) | null }) {
  const apri = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); onOpen?.(); };
  return <span role="button" tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen || undefined}
    aria-label={`Riepilogo articolo riga ${idx + 1}`} title={onOpen ? "Riepilogo articolo" : "Scegli prima il cliente"}
    onClick={onOpen ? apri : (e) => e.stopPropagation()}
    onKeyDown={(e) => { if (onOpen && (e.key === "Enter" || e.key === " ")) apri(e); }}
    className={cn("grid size-10 shrink-0 place-items-center rounded-md text-pv-blu sm:size-6",
      onOpen ? "cursor-pointer hover:bg-pv-azzurro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "cursor-not-allowed opacity-40")}>
    <Info className="size-4 sm:size-3.5" aria-hidden />
  </span>;
}

function useCelleRiga(p: RigaProps) {
  const { row, calc, readOnly, autoOpenPicker = false, onOpenArticolo, onPatch, onSceltaGamma, prezziSpecialiMap } = p;
  const tipo = row.tipo_riga;
  const intestazioneKit = isIntestazioneKit(row);
  const kitSenzaPrezzo = tipo === "da_kit" && !intestazioneKit && (row.prezzo_unit == null || !row.articolo_codice);
  const isCompact = tipo === "nota" || tipo === "separatore" || intestazioneKit;
  const isSubtotal = tipo === "sotto_totale";
  const valorizzata = !isCompact && !isSubtotal;
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
        <ArticoloGammaPicker soloCodice autoOpen={autoOpenPicker}
          codice={row.articolo_codice ?? row.articolo?.cod_gamma ?? null}
          descrizione={row.descrizione} onChange={onSceltaGamma} disabled={readOnly} />
      </div>
    </div>
  ) : valorizzata ? <span className="block px-1 py-2 font-mono text-xs">MANUALE</span> : null;
  const articolo = (
    <>
      <Input key={`${row.id}-${row.descrizione ?? ""}`} defaultValue={row.descrizione ?? ""}
        aria-label="Descrizione riga" disabled={readOnly}
        onBlur={(e) => { if ((e.target.value || null) !== row.descrizione) onPatch({ descrizione: e.target.value || null }); }}
        className="h-[26px] min-w-0 rounded border-transparent bg-transparent px-1.5 py-1 font-sans text-xs shadow-none outline-none hover:border-input focus:border-ring focus:bg-card focus-visible:ring-0 md:text-xs" placeholder={isText ? "Nota libera…" : isSubtotal ? "Sotto-totale" : "Descrizione…"} />
      {prezzoMancante && <span role="alert" className="mt-0.5 block font-sans text-[11px] font-semibold text-destructive">Prezzo non disponibile: inseriscilo a mano</span>}
    </>
  );

  const qOrd = Number((row as unknown as { qta_ordinata?: number }).qta_ordinata ?? 0);
  const evasa = qOrd > 0 && qOrd >= q;
  const parziale = qOrd > 0 && qOrd < q;

  return {
    tipo, isCompact, isSubtotal, valorizzata, segno, kitSenzaPrezzo,
    articolo,
    codice,
    um: row.articolo_codice ? <CellaUm idx={p.idx} um1={unita.um1 ?? unita.um ?? row.um ?? "—"} um2={unita.convertibile ? unita.um2 ?? null : null}
      fattore={row.unita_gamma?.fattore_conversione ?? null} secondaria={!!unita.secondaria} disabled={readOnly}
      onChange={(um_scelta) => onPatch({ um_scelta })} /> : (
      <Input defaultValue={row.um ?? ""} aria-label="Unità di misura" disabled={readOnly}
        onBlur={(e) => { if ((e.target.value || null) !== row.um) onPatch({ um: e.target.value || null }); }}
        className="h-[26px] rounded border-transparent bg-transparent px-1 py-1 text-xs shadow-none hover:border-input focus:border-ring focus:bg-card focus-visible:ring-0 md:text-xs" />
    ),
    incidenza: (
      <EditableNumberCell value={unita.incidenza} decimali={4} ariaLabel="Incidenza"
        onCommit={(v) => salvaInUnita({ incidenza: v })} />
    ),
    quantita: (
      <div className="flex flex-col items-end gap-0.5">
        <EditableNumberCell value={unita.quantita} decimali={2} ariaLabel="Quantità riga"
          onCommit={(v) => salvaInUnita({ quantita: v })} {...(evasa ? { disabled: true } : {})} />
        {(parziale || evasa) && (
          <span className={cn("text-[10px] font-semibold", evasa ? "text-[#009246]" : "text-amber-600")}
            title={evasa ? "Riga completamente evasa" : "Ordinato parzialmente"}>
            {evasa ? "✓ Evasa " : "Ord. "}{qOrd.toLocaleString("it-IT")}/{q.toLocaleString("it-IT")}
          </span>
        )}
      </div>
    ),
    lordo: (
      <EditableNumberCell value={unita.prezzo_unit} decimali={4}
        onCommit={(v) => salvaInUnita({ prezzo_unit: v })} />
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
    netto: row.prezzo_unit == null ? "—" : fmt4(unita.netto ?? 0),
    segnoSel: (
      <Select value={String(segno)} onValueChange={(v) => onPatch({ segno: Number(v) === -1 ? -1 : 1 })}>
        <SelectTrigger className="h-8 w-12 px-1 text-xs" aria-label="Segno"><SelectValue /></SelectTrigger>
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
    peso: row.articolo_codice && row.peso_gamma_unit == null ? "—" : fmt2(calc.peso),
    onRowClick: readOnly && vecchioCatalogo ? () => row.articolo_id && onOpenArticolo(row.articolo_id) : undefined,
  };
}

function BadgeMargine({ perc, testo }: { perc: number; testo: React.ReactNode }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-xs font-semibold",
    perc < 0 ? "bg-destructive/10 text-destructive" : "bg-pv-verde-tenue text-pv-verde")}>{testo}</span>;
}
const BADGE_MANUALE = <span className="mr-1 inline-flex rounded bg-pv-giallo-tenue px-1.5 py-0.5 font-sans text-[9.5px] font-bold uppercase tracking-wide text-pv-giallo not-italic">Manuale</span>;

function AzioniRiga(p: RigaProps) {
  return (
    <div className="flex items-center justify-end gap-0.5">
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
  const sortable = useSortable({ id: p.row.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };
  const c = useCelleRiga(p);
  const rowClass = cn(
    "border-b font-mono align-top whitespace-nowrap [&>td]:border-b",
    c.tipo === "manuale" && "bg-pv-giallo-tenue/30",
    c.isSubtotal && "bg-primary/5 font-semibold",
    c.tipo === "separatore" && "h-2 bg-muted/30",
    c.tipo === "nota" && "bg-muted/20 italic",
    c.onRowClick && "cursor-pointer hover:bg-accent/40",
    c.kitSenzaPrezzo && "bg-destructive/10",
  );
  const grip = (
    <td className="sticky left-0 z-[1] bg-card">
      <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab px-0.5" title="Trascina">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
    </td>
  );
  if (c.tipo === "separatore") {
    return (
      <tr ref={sortable.setNodeRef} style={style} className={rowClass}>
        {grip}
        <td colSpan={16}></td>
        <td className="text-right"><AzioniRiga {...p} /></td>
      </tr>
    );
  }
  const v = c.valorizzata;
  return (
    <tr ref={sortable.setNodeRef} style={style} className={rowClass} onClick={c.onRowClick}>
      {grip}
      <td className="sticky left-[18px] z-[1] bg-card py-0.5 text-center text-xs text-muted-foreground"><div className="flex flex-col items-center"><span>{p.idx + 1}</span>{p.row.articolo_codice && <PulsanteRiepilogo idx={p.idx} onOpen={p.onOpenRiepilogo ?? null} />}</div></td>
      <td className="sticky left-[58px] z-[1] min-w-0 bg-card px-1 py-0.5">{c.codice}</td>
      <td className="sticky left-[214px] z-[1] min-w-0 border-r bg-card px-1 py-0.5">{c.tipo === "manuale" && <div className="pt-0.5">{BADGE_MANUALE}</div>}{c.articolo}{c.kitSenzaPrezzo && (
        <p className="mt-0.5 text-[11px] font-sans not-italic text-destructive">Articolo non collegato a Gamma: inserisci prezzo e costo a mano</p>
      )}</td>
      <td className="px-0.5 py-0.5">{v && c.um}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.incidenza}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.quantita}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.lordo}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.sconti}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.magg}</td>
      <td className="px-0.5 py-0.5 text-right">{v && c.extra}</td>
      <td className="px-1 py-1.5 text-right">{v && c.netto}</td>
      <td className="px-0.5 py-0.5 text-center">{v && c.segnoSel}</td>
      <td className={cn("px-1 py-1.5 text-right", c.isSubtotal && "border-y-2 border-primary/40 text-xs",
        p.calc.importoEffettivo < 0 && "text-destructive")}>
        {(v || c.isSubtotal) && c.importo}
      </td>
      <td className="px-0.5 py-0.5 text-right text-muted-foreground">{v && c.costo}</td>
      <td className="px-1 py-1 text-right">{v && <BadgeMargine perc={p.calc.margine_perc} testo={c.margine} />}</td>
      <td className="px-1 py-1.5 text-right text-muted-foreground">{v && c.peso}</td>
      <td className="px-0.5 text-right"><AzioniRiga {...p} /></td>
    </tr>
  );
}

/** Sotto 1024 px: la riga come scheda compatta con gli stessi campi. */
function RigaScheda(p: RigaProps) {
  const c = useCelleRiga(p);
  if (c.tipo === "separatore") {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
        <span>Separatore</span><AzioniRiga {...p} />
      </div>
    );
  }
  const campo = (label: string, node: React.ReactNode, cls?: string) => (
    <label className={cn("grid min-w-0 gap-0.5", cls)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
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
    <div className={cn("rounded-md border p-2", c.tipo === "manuale" && "bg-pv-giallo-tenue/30",
      c.isSubtotal && "bg-primary/5", c.tipo === "nota" && "bg-muted/20",
      c.kitSenzaPrezzo && "border-destructive bg-destructive/10")}
      onClick={c.onRowClick}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1"><span className="min-w-0 break-words text-xs text-muted-foreground">{c.tipo === "manuale" && BADGE_MANUALE}Riga {p.idx + 1} · {TIPI_RIGA_LABEL[c.tipo]}</span>{p.row.articolo_codice && <PulsanteRiepilogo idx={p.idx} onOpen={p.onOpenRiepilogo ?? null} />}</div>
          {c.valorizzata && campo("Codice", c.codice)}
          {campo("Descrizione", c.articolo)}
          {c.kitSenzaPrezzo && (
        <p className="mt-0.5 text-[11px] font-sans not-italic text-destructive">Articolo non collegato a Gamma: inserisci prezzo e costo a mano</p>
      )}
        </div>
        <AzioniRiga {...p} />
      </div>
      {c.valorizzata && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {campo("U.M.", c.um)}
          {campo("Incidenza", c.incidenza)}
          {campo("Quantità", c.quantita)}
          {campo("Prezzo lordo", c.lordo)}
          {campo("Sconti", c.sconti)}
          {campo("Magg.%", c.magg)}
          {campo("Sc. extra %", c.extra)}
          {valore("Netto", c.netto)}
          {campo("±", c.segnoSel)}
          {campo("Costo unit.", c.costo)}
          {valore("Marg.%", <BadgeMargine perc={p.calc.margine_perc} testo={c.margine} />)}
          {valore("Peso", c.peso)}
          {valore("Importo", <span className="text-xs font-semibold">{c.importo}</span>, "col-span-2 sm:col-span-4")}
        </div>
      )}
      {c.isSubtotal && valore("Sotto-totale", <span className="text-xs font-semibold">{c.importo}</span>)}
    </div>
  );
}

function RowActions({
  onAddAbove, onAddBelow, onChangeType, currentType,
}: {
  onAddAbove: (t: TipoRiga) => void;
  onAddBelow: (t: TipoRiga) => void;
  onChangeType: (t: TipoRiga) => void;
  currentType: TipoRiga;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7">
          <span className="text-xs">⋯</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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


