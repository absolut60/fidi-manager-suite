import { useEffect, useMemo, useState } from "react";
import { ArticoloDettaglioDialog } from "@/components/preventivatore/ArticoloDettaglioDialog";
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
import {
  calcolaBlocco, deleteRiga, fractionalOrder, insertRiga, reorderRighe,
  statoPrezzoSpecialeRiga,
  TIPI_RIGA, TIPI_RIGA_LABEL, updateRiga,
  type BloccoConRighe, type PrezziSpecialiMap, type Riga, type TipoRiga,
} from "@/lib/preventivi-api";
import type { FasciaListino } from "@/lib/articoli-api";
import { round2 } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function RigheTable({
  blocco,
  preventivoId,
  fascia,
  readOnly = false,
  prezziSpecialiMap,
}: {
  blocco: BloccoConRighe;
  preventivoId: string;
  fascia: FasciaListino;
  readOnly?: boolean;
  prezziSpecialiMap?: PrezziSpecialiMap | null;
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
  const calcMap = useMemo(() => new Map(calcs.righe.map((r) => [r.id, r.calc])), [calcs]);

  const upd = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateRiga>[1] }) =>
      updateRiga(id, patch),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteRiga(id),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const ins = useMutation({
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

  return (
    <div className="overflow-x-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="w-6"></th>
              <th className="w-8 text-center">Tipo</th>
              <th className="min-w-[280px] px-2 py-1.5 text-left">Articolo / Descrizione</th>
              <th className="w-16 px-2 py-1.5 text-left">U.M.</th>
              <th className="w-20 px-1 py-1.5 text-right">Incidenza</th>
              <th className="w-20 px-1 py-1.5 text-right">Quantità</th>
              <th className="w-24 px-1 py-1.5 text-right">Prezzo unit.</th>
              <th className="w-16 px-1 py-1.5 text-right">Sconto%</th>
              <th className="w-10 px-1 py-1.5 text-center">±</th>
              <th className="w-24 px-1 py-1.5 text-right">Importo</th>
              <th className="w-24 px-1 py-1.5 text-right">Costo</th>
              <th className="w-16 px-1 py-1.5 text-right">Marg.%</th>
              <th className="w-24 px-1 py-1.5 text-right">Vendita</th>
              <th className="w-20 px-1 py-1.5 text-right">Peso</th>
              <th className="w-12 px-1"></th>
            </tr>
          </thead>
          <SortableContext items={blocco.righe.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody>
              {blocco.righe.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-6 text-center text-muted-foreground">
                    Nessuna riga. Aggiungi la prima.
                  </td>
                </tr>
              ) : (
                blocco.righe.map((r, idx) => (
                  <RigaRow
                    key={r.id}
                    row={r}
                    idx={idx}
                    fascia={fascia}
                    readOnly={readOnly}
                    autoOpenPicker={r.id === pendingPickerId}
                    onOpenArticolo={(aid) => setOpenArticoloId(aid)}
                    prezziSpecialiMap={prezziSpecialiMap ?? null}
                    calc={calcMap.get(r.id)!}
                    onPatch={(patch) => upd.mutate({ id: r.id, patch })}
                    onDelete={() => del.mutate(r.id)}
                    onAddAbove={(tipo) => {
                      const ordine = ordineAround(idx, "above");
                      ins.mutate({
                        blocco_id: blocco.id, tipo_riga: tipo, ordine, segno: 1,
                      });
                    }}
                    onAddBelow={(tipo) => {
                      const ordine = ordineAround(idx, "below");
                      ins.mutate({
                        blocco_id: blocco.id, tipo_riga: tipo, ordine, segno: 1,
                      });
                    }}
                  />
                ))
              )}
            </tbody>
          </SortableContext>
          <tfoot>
            <tr className="border-t bg-muted/30 text-xs">
              <td colSpan={9} className="px-2 py-2">
                <AddRowMenu
                  readOnly={readOnly}
                  onAddArticolo={addArticoloEmptyAndOpen}
                  onPick={(tipo) => addRow(null, tipo)}
                />
              </td>


              <td className="px-1 py-2 text-right font-mono font-semibold">€ {calcs.totale.toFixed(2)}</td>
              <td className="px-1 py-2 text-right font-mono text-muted-foreground">€ {calcs.costo.toFixed(2)}</td>
              <td className="px-1 py-2 text-right font-mono text-muted-foreground">
                {(() => {
                  const v = calcs.righe.reduce((a, x) => a + x.calc.vendita, 0);
                  const m = v ? ((v - calcs.costo) / v) * 100 : 0;
                  return `${m.toFixed(1)}%`;
                })()}
              </td>
              <td></td>
              <td className="px-1 py-2 text-right font-mono text-muted-foreground">{calcs.peso.toFixed(2)} kg</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </DndContext>
      <ArticoloDettaglioDialog
        articoloId={openArticoloId}
        open={!!openArticoloId}
        onOpenChange={(b) => { if (!b) setOpenArticoloId(null); }}
      />
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



function RigaRow({
  row, idx, calc, fascia, readOnly, autoOpenPicker = false, onOpenArticolo, onPatch, onDelete, onAddAbove, onAddBelow,
  prezziSpecialiMap,
}: {
  row: Riga & { articolo: { id: string; cod_gamma: string | null; descrizione: string; um: string | null; peso_unit: number | null } | null };
  idx: number;
  fascia: FasciaListino;
  readOnly: boolean;
  autoOpenPicker?: boolean;
  onOpenArticolo: (id: string) => void;
  calc: ReturnType<typeof calcolaBlocco>["righe"][number]["calc"];
  onPatch: (patch: Parameters<typeof updateRiga>[1]) => void;
  onDelete: () => void;
  onAddAbove: (tipo: TipoRiga) => void;
  onAddBelow: (tipo: TipoRiga) => void;
  prezziSpecialiMap?: PrezziSpecialiMap | null;
}) {

  const sortable = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  const tipo = row.tipo_riga;
  const isCompact = tipo === "nota" || tipo === "separatore";
  const isSubtotal = tipo === "sotto_totale";
  const isManual = tipo === "manuale";
  const isText = tipo === "nota";
  const segno = (row.segno ?? 1) === -1 ? -1 : 1;

  const articoloId = row.articolo_id;
  const clickable = readOnly && !!articoloId;
  const onRowClick = clickable ? () => onOpenArticolo(articoloId!) : undefined;

  const rowClass = cn(
    "border-b font-mono",
    isManual && "bg-amber-50/40 dark:bg-amber-950/10",
    isSubtotal && "bg-primary/5 font-semibold",
    tipo === "separatore" && "h-2 bg-muted/30",
    tipo === "nota" && "bg-muted/20 italic",
    clickable && "cursor-pointer hover:bg-accent/40",
  );


  if (tipo === "separatore") {
    return (
      <tr ref={sortable.setNodeRef} style={style} className={rowClass} onClick={onRowClick}>
        <td>
          <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab px-1">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>
        </td>
        <td colSpan={13}></td>
        <td className="text-right">
          <div className="flex items-center justify-end gap-0.5">
            <Button size="icon" variant="ghost"
              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete} title="Elimina riga">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <RowActions onAddAbove={onAddAbove} onAddBelow={onAddBelow}
              onChangeType={(t) => onPatch({ tipo_riga: t })} currentType={tipo} />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr ref={sortable.setNodeRef} style={style} className={rowClass} onClick={onRowClick}>
      <td className="w-6">
        <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab px-1" title="Trascina">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
      </td>
      <td className="text-center text-[10px] text-muted-foreground">{idx + 1}</td>
      <td className="px-1 py-0.5">
        {(tipo === "articolo_singolo" || tipo === "da_kit") ? (
          <>
            <ArticoloPicker
              autoOpen={autoOpenPicker}
              value={row.articolo_id}
              onChange={(articolo_id, articolo) => {
                const listino = articolo?.listini_vendita?.find((l) => l.fascia === fascia);
                const acquistoRecente = articolo?.listini_acquisto?.[0];
                let prezzo = listino?.prezzo == null ? null : Number(listino.prezzo);
                let costo = acquistoRecente?.costo_netto == null ? null : Number(acquistoRecente.costo_netto);
                const sp = articolo?.cod_gamma && prezziSpecialiMap ? prezziSpecialiMap.get(articolo.cod_gamma) : undefined;
                if (sp) {
                  if (sp.costo != null) costo = sp.costo;
                  if (sp.prezzo != null) prezzo = sp.prezzo;
                }
                onPatch({
                  articolo_id,
                  um: articolo?.um ?? null,
                  descrizione: articolo?.descrizione ?? null,
                  prezzo_unit: prezzo,
                  sconto_perc: sp ? 0 : (row.sconto_perc ?? 0),
                  costo,
                  vendita: prezzo,
                  peso: articolo?.peso_unit == null ? null : Number(articolo.peso_unit),
                });
              }}
            />
            {(() => {
              const st = statoPrezzoSpecialeRiga(
                { prezzo_unit: row.prezzo_unit, costo: row.costo, quantita: row.quantita },
                row.articolo?.cod_gamma,
                prezziSpecialiMap,
              );
              if (!st) return null;
              const fmt = (v: number | null) => v == null ? "—" : `€ ${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`;
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#0d1f3c]/30 bg-[#0d1f3c]/5 px-1.5 py-0.5 text-[10px] font-semibold text-[#0d1f3c]"
                      >
                        🏗 Cantiere{st.stato === "modificato" ? " (modificato)" : ""}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Prezzo speciale cantiere — costo: {fmt(st.special.costo)} / vendita: {fmt(st.special.prezzo)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
          </>
        ) : (
          <Input
            defaultValue={row.descrizione ?? ""}
            onBlur={(e) => {
              if ((e.target.value || null) !== row.descrizione)
                onPatch({ descrizione: e.target.value || null });
            }}
            className="h-7 text-xs"
            placeholder={isText ? "Nota libera…" : isSubtotal ? "Sotto-totale" : "Descrizione…"}
          />
        )}
      </td>
      <td className="px-1">
        {isCompact || isSubtotal ? null : (
          <Input
            defaultValue={row.um ?? ""}
            onBlur={(e) => {
              if ((e.target.value || null) !== row.um) onPatch({ um: e.target.value || null });
            }}
            className="h-7 text-xs"
          />
        )}
      </td>
      <td className="px-1 text-right">
        {isCompact || isSubtotal ? null : (
          <EditableNumberCell
            value={row.incidenza == null ? null : Number(row.incidenza)}
            step={0.0001}
            onCommit={(v) => onPatch({ incidenza: v })}
          />
        )}
      </td>
      <td className="px-1 text-right">
        {isCompact || isSubtotal ? null : (() => {
          const qOrd = Number((row as unknown as { qta_ordinata?: number }).qta_ordinata ?? 0);
          const qTot = Number(row.quantita ?? 0);
          const evasa = qOrd > 0 && qOrd >= qTot;
          const parziale = qOrd > 0 && qOrd < qTot;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <EditableNumberCell
                value={row.quantita == null ? null : Number(row.quantita)}
                step={0.01}
                onCommit={(v) => onPatch({ quantita: v })}
                {...(evasa ? { disabled: true } : {})}
              />
              {(parziale || evasa) && (
                <span
                  className={cn(
                    "text-[9px] font-semibold",
                    evasa ? "text-[#009246]" : "text-amber-600",
                  )}
                  title={evasa ? "Riga completamente evasa" : "Ordinato parzialmente"}
                >
                  {evasa ? "✓ Evasa " : "Ord. "}
                  {qOrd.toLocaleString("it-IT")}/{qTot.toLocaleString("it-IT")}
                </span>
              )}
            </div>
          );
        })()}
      </td>
      <td className="px-1 text-right">
        {isCompact || isSubtotal ? null : (
          <EditableNumberCell
            value={row.prezzo_unit == null ? null : Number(row.prezzo_unit)}
            step={0.01}
            onCommit={(v) => onPatch({ prezzo_unit: v })}
          />
        )}
      </td>
      <td className="px-1 text-right">
        {isCompact || isSubtotal ? null : (
          <EditableNumberCell
            value={row.sconto_perc == null ? null : Number(row.sconto_perc)}
            step={0.1}
            onCommit={(v) => onPatch({ sconto_perc: v })}
          />
        )}
      </td>
      <td className="px-1 text-center">
        {isCompact || isSubtotal ? null : (
          <Select
            value={String(segno)}
            onValueChange={(v) => onPatch({ segno: Number(v) === -1 ? -1 : 1 })}
          >
            <SelectTrigger className="h-7 w-12 px-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">+</SelectItem>
              <SelectItem value="-1">−</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className={cn("px-1 py-1 text-right",
        isSubtotal && "border-y-2 border-primary/40 text-sm",
        calc.importoEffettivo < 0 && "text-destructive")}>
        € {(isSubtotal ? calc.importoEffettivo : calc.importo).toFixed(2)}
      </td>
      <td className="px-1 py-1 text-right text-muted-foreground">
        {isCompact || isSubtotal ? "" : `€ ${calc.costo.toFixed(2)}`}
      </td>
      <td className={cn("px-1 py-1 text-right",
        !isCompact && !isSubtotal && calc.margine_perc < 0 && "text-destructive")}>
        {isCompact || isSubtotal ? "" : `${calc.margine_perc.toFixed(1)}%`}
      </td>
      <td className="px-1 py-1 text-right text-muted-foreground">
        {isCompact || isSubtotal ? "" : `€ ${calc.vendita.toFixed(2)}`}
      </td>
      <td className="px-1 py-1 text-right text-muted-foreground">
        {isCompact || isSubtotal ? "" : `${calc.peso.toFixed(2)}`}
      </td>
      <td className="px-1 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            title="Elimina riga"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <RowActions onAddAbove={onAddAbove} onAddBelow={onAddBelow}
            onChangeType={(t) => {
              const patch: Parameters<typeof updateRiga>[1] = { tipo_riga: t };
              onPatch(patch);
            }}
            currentType={tipo} />
        </div>
      </td>
    </tr>
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


void round2;
