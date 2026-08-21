import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseNumeroIt } from "@/lib/numero-it";
import {
  calcolaRigaKit,
  calcolaTotaliKit,
  deleteComponente,
  deleteKit,
  duplicateKit,
  fetchKit,
  insertComponente,
  updateComponente,
  updateKit,
  type FasciaListino,
  type KitComponente,
  type KitFamiglia,
} from "@/lib/kit-api";
import { FAMIGLIE_KIT, FAMIGLIA_LABEL, TIPI_DRIVER, calcIncidenzaFromDriver, type TipoDriver } from "@/lib/incidenza";
import { FASCE } from "@/lib/articoli-api";
import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import { ArticoloPicker } from "@/components/kit/ArticoloPicker";

export const Route = createFileRoute("/_app/kit/$id")({
  head: () => ({ meta: [{ title: "Editor Kit — Sistema MADE" }] }),
  component: KitEditorPage,
});

function KitEditorPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fascia, setFascia] = useState<FasciaListino>("A");

  const { data: kit, isLoading } = useQuery({
    queryKey: ["kit", id],
    queryFn: () => fetchKit(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kit", id] });
    qc.invalidateQueries({ queryKey: ["kits-with-comp"] });
  };

  const saveKit = useMutation({
    mutationFn: (patch: Parameters<typeof updateKit>[1]) => updateKit(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Salvato");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const addRow = useMutation({
    mutationFn: () =>
      insertComponente({
        kit_id: id,
        articolo_id: null,
        ordine: (kit?.componenti.length ?? 0) + 1,
        tipo_driver: "INCIDENZA_FISSA",
      }),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const updRow = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateComponente>[1] }) =>
      updateComponente(id, patch),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const delRow = useMutation({
    mutationFn: (rowId: string) => deleteComponente(rowId),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const dupKit = useMutation({
    mutationFn: () => duplicateKit(id),
    onSuccess: (k) => {
      toast.success("Kit duplicato");
      navigate({ to: "/kit/$id", params: { id: k.id } });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const delKit = useMutation({
    mutationFn: () => deleteKit(id),
    onSuccess: () => {
      toast.success("Kit eliminato");
      navigate({ to: "/kit" });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const totali = useMemo(
    () => (kit ? calcolaTotaliKit(kit.componenti, fascia) : null),
    [kit, fascia],
  );

  if (isLoading || !kit) {
    return (
      <div className="p-3 md:p-4 lg:p-6 text-sm text-muted-foreground">Caricamento…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 md:p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/kit"><ArrowLeft className="mr-1 h-4 w-4" /> Kit</Link>
          </Button>
          <h1 className="text-xl font-semibold">{kit.nome}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Fascia:</span>
            <Select value={fascia} onValueChange={(v) => setFascia(v as FasciaListino)}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FASCE.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => dupKit.mutate()}>
            <Copy className="mr-1 h-4 w-4" /> Duplica
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="mr-1 h-4 w-4" /> Elimina
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare il kit?</AlertDialogTitle>
                <AlertDialogDescription>
                  Verranno eliminati anche tutti i componenti collegati. Operazione irreversibile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => delKit.mutate()}>Elimina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Intestazione kit */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div className="grid gap-1.5 md:col-span-2">
            <Label className="text-xs">Nome</Label>
            <Input
              defaultValue={kit.nome}
              onBlur={(e) => {
                if (e.target.value !== kit.nome) saveKit.mutate({ nome: e.target.value });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Famiglia</Label>
            <Select
              value={kit.famiglia}
              onValueChange={(v) => saveKit.mutate({ famiglia: v as KitFamiglia })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FAMIGLIE_KIT.map((f) => (
                  <SelectItem key={f} value={f}>{FAMIGLIA_LABEL[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Spessore (mm)</Label>
            <Input
              type="text"
              inputMode="decimal"
              defaultValue={kit.spessore == null ? "" : String(kit.spessore).replace(".",",")}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : parseNumeroIt(e.target.value);
                if (v !== (kit.spessore == null ? null : Number(kit.spessore))) {
                  saveKit.mutate({ spessore: v });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Tipo struttura</Label>
            <Input
              defaultValue={kit.tipo_struttura ?? ""}
              onBlur={(e) => {
                if ((e.target.value || null) !== kit.tipo_struttura) {
                  saveKit.mutate({ tipo_struttura: e.target.value || null });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">H. max (m)</Label>
            <Input
              type="text"
              inputMode="decimal"
              defaultValue={kit.h_max == null ? "" : String(kit.h_max).replace(".",",")}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : parseNumeroIt(e.target.value);
                if (v !== (kit.h_max == null ? null : Number(kit.h_max))) {
                  saveKit.mutate({ h_max: v });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Isolante</Label>
            <Input
              defaultValue={kit.isolante ?? ""}
              onBlur={(e) => {
                if ((e.target.value || null) !== kit.isolante) {
                  saveKit.mutate({ isolante: e.target.value || null });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">U.M. base</Label>
            <Input
              defaultValue={kit.um_base}
              onBlur={(e) => {
                if (e.target.value && e.target.value !== kit.um_base) {
                  saveKit.mutate({ um_base: e.target.value });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-3">
            <Label className="text-xs">Descrizione tecnica</Label>
            <Textarea
              rows={2}
              defaultValue={kit.descrizione_tecnica ?? ""}
              onBlur={(e) => {
                if ((e.target.value || null) !== kit.descrizione_tecnica) {
                  saveKit.mutate({ descrizione_tecnica: e.target.value || null });
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabella componenti */}
      <div className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Componenti</h2>
          <Button size="sm" onClick={() => addRow.mutate()} disabled={addRow.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Aggiungi riga
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px] uppercase tracking-wide">
                <TableHead className="w-24">Ruolo</TableHead>
                <TableHead className="min-w-[280px]">Articolo</TableHead>
                <TableHead className="w-14">Lato</TableHead>
                <TableHead className="w-16">Strato</TableHead>
                <TableHead className="w-32">Tipo driver</TableHead>
                <TableHead className="w-24 text-right">Val. driver</TableHead>
                <TableHead className="w-24 text-right">Incidenza</TableHead>
                <TableHead className="w-24 text-right">Costo</TableHead>
                <TableHead className="w-24 text-right">Vendita</TableHead>
                <TableHead className="w-24 text-right">Importo</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kit.componenti.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                    Nessun componente. Aggiungi la prima riga.
                  </TableCell>
                </TableRow>
              ) : (
                kit.componenti.map((c) => (
                  <ComponenteRow
                    key={c.id}
                    row={c}
                    fascia={fascia}
                    onPatch={(patch) => updRow.mutate({ id: c.id, patch })}
                    onDelete={() => delRow.mutate(c.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {totali && (
          <div className="grid grid-cols-2 gap-4 border-t bg-muted/40 px-4 py-3 md:grid-cols-4">
            <Totale label={`Prezzo / ${kit.um_base}`} value={`€ ${totali.prezzo_mq.toFixed(2)}`} strong />
            <Totale label={`Costo / ${kit.um_base}`} value={`€ ${totali.costo_mq.toFixed(2)}`} />
            <Totale
              label="Margine"
              value={`${totali.margine_perc.toFixed(2)}%`}
              strong
              tone={totali.margine_perc < 0 ? "negative" : undefined}
            />
            <Totale label={`Peso / ${kit.um_base}`} value={`${totali.kg_mq.toFixed(2)} kg`} />
          </div>
        )}
      </div>
    </div>
  );
}

function Totale({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "negative";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`font-mono ${strong ? "text-lg font-semibold" : "text-sm"} ${
          tone === "negative" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ComponenteRow({
  row,
  fascia,
  onPatch,
  onDelete,
}: {
  row: KitComponente & { articolo: import("@/lib/kit-api").ArticoloConListini | null };
  fascia: FasciaListino;
  onPatch: (patch: Parameters<typeof updateComponente>[1]) => void;
  onDelete: () => void;
}) {
  const calc = calcolaRigaKit(row, row.articolo, fascia);
  const importo = calc.vendita_riga;

  return (
    <TableRow className="text-xs">
      <TableCell>
        <Input
          defaultValue={row.ruolo ?? ""}
          onBlur={(e) => {
            if ((e.target.value || null) !== row.ruolo) onPatch({ ruolo: e.target.value || null });
          }}
          className="h-7 text-xs"
          placeholder="—"
        />
      </TableCell>
      <TableCell>
        <ArticoloPicker
          value={row.articolo_id}
          onChange={(articolo_id) => onPatch({ articolo_id })}
          placeholder="— Seleziona articolo —"
        />
        {row.articolo?.um && (
          <div className="mt-0.5 px-1 font-mono text-[10px] text-muted-foreground">
            U.M. {row.articolo.um}
            {row.articolo.qta_fornitore != null && ` · conf. ${Number(row.articolo.qta_fornitore)}`}
          </div>
        )}
      </TableCell>
      <TableCell>
        <EditableNumberCell
          value={row.lato == null ? null : Number(row.lato)}
          step={1}
          onCommit={(v) => onPatch({ lato: v == null ? null : Math.round(v) })}
        />
      </TableCell>
      <TableCell>
        <EditableNumberCell
          value={row.strato == null ? null : Number(row.strato)}
          step={1}
          onCommit={(v) => onPatch({ strato: v == null ? null : Math.round(v) })}
        />
      </TableCell>
      <TableCell>
        <Select
          value={row.tipo_driver ?? "INCIDENZA_FISSA"}
          onValueChange={(v) => onPatch({ tipo_driver: v as TipoDriver })}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIPI_DRIVER.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <EditableNumberCell
          value={row.valore_driver == null ? null : Number(row.valore_driver)}
          step={0.0001}
          onCommit={(v) => {
            // Quando cambia il driver, ricalcoliamo l'incidenza azzerando l'override.
            const inc = calcIncidenzaFromDriver({
              tipo_driver: row.tipo_driver as TipoDriver | null,
              valore_driver: v,
              qta_confezione: row.articolo?.qta_fornitore ?? row.articolo?.qta_cliente ?? null,
            });
            onPatch({ valore_driver: v, incidenza: inc });
          }}
        />
      </TableCell>
      <TableCell>
        <EditableNumberCell
          value={calc.incidenza_effettiva}
          step={0.0001}
          onCommit={(v) => onPatch({ incidenza: v })}
        />
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        € {calc.costo_unit.toFixed(2)}
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        € {calc.vendita_unit.toFixed(2)}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        € {importo.toFixed(2)}
      </TableCell>
      <TableCell>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
