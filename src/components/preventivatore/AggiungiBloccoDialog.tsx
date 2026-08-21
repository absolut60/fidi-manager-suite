import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calcolaTotaliKit, fetchKitsWithComponenti } from "@/lib/kit-api";
import { FAMIGLIE_KIT, FAMIGLIA_LABEL } from "@/lib/incidenza";
import { addBloccoDaKit, addBloccoVuoto, fractionalOrder } from "@/lib/preventivi-api";
import type { FasciaListino } from "@/lib/articoli-api";
import { toast } from "sonner";
import { parseNumeroIt } from "@/lib/numero-it";

export function AggiungiBloccoDialog({
  open, onOpenChange, preventivoId, fascia, lastOrdine,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preventivoId: string;
  fascia: FasciaListino;
  lastOrdine: number;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"kit" | "vuoto">("kit");
  const [famiglia, setFamiglia] = useState<string>("ALL");
  const [kitId, setKitId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("1");

  const { data: kits = [] } = useQuery({
    queryKey: ["kits-with-comp"],
    queryFn: fetchKitsWithComponenti,
    enabled: open,
  });

  const filtered = kits.filter((k) => famiglia === "ALL" || k.famiglia === famiglia);

  const addKit = useMutation({
    mutationFn: () =>
      addBloccoDaKit({
        preventivo_id: preventivoId,
        kit_id: kitId!,
        quantita_base: parseNumeroIt(quantita) ?? 0,
        fascia,
        ordine: fractionalOrder(lastOrdine, null),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });
      onOpenChange(false);
      setKitId(null);
      toast.success("Blocco aggiunto");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const addVuoto = useMutation({
    mutationFn: () => addBloccoVuoto(preventivoId, fractionalOrder(lastOrdine, null)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });
      onOpenChange(false);
      toast.success("Blocco vuoto aggiunto");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Aggiungi blocco</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "kit" | "vuoto")}>
          <TabsList>
            <TabsTrigger value="kit">Da kit</TabsTrigger>
            <TabsTrigger value="vuoto">Blocco vuoto</TabsTrigger>
          </TabsList>
          <TabsContent value="kit" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Famiglia</Label>
                <Select value={famiglia} onValueChange={setFamiglia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tutte</SelectItem>
                    {FAMIGLIE_KIT.map((f) => (
                      <SelectItem key={f} value={f}>{FAMIGLIA_LABEL[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Quantità base</Label>
                <Input type="text" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value.replace(/[^0-9.,]/g, ""))} />
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded border">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Nessun kit disponibile.</div>
              ) : (
                filtered.map((k) => {
                  const t = calcolaTotaliKit(k.componenti, fascia);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setKitId(k.id)}
                      className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-accent ${
                        kitId === k.id ? "bg-accent/50" : ""
                      }`}
                    >
                      <div>
                        <div className="font-medium">{k.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {FAMIGLIA_LABEL[k.famiglia]}{k.spessore != null ? ` · sp. ${Number(k.spessore)} mm` : ""}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-right">
                        <div>€ {t.prezzo_mq.toFixed(2)}/{k.um_base}</div>
                        <div className="text-muted-foreground">{t.margine_perc.toFixed(1)}%</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>
          <TabsContent value="vuoto">
            <p className="text-sm text-muted-foreground">
              Crea un blocco senza righe. Aggiungerai materiali manualmente.
            </p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {tab === "kit" ? (
            <Button onClick={() => addKit.mutate()} disabled={!kitId || addKit.isPending}>
              Aggiungi kit
            </Button>
          ) : (
            <Button onClick={() => addVuoto.mutate()} disabled={addVuoto.isPending}>
              Crea blocco vuoto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
