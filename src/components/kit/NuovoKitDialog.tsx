import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { parseNumeroIt } from "@/lib/numero-it";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createKit, type KitFamiglia } from "@/lib/kit-api";
import { FAMIGLIE_KIT, FAMIGLIA_LABEL } from "@/lib/incidenza";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function NuovoKitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [famiglia, setFamiglia] = useState<KitFamiglia>("PARETE");
  const [spessore, setSpessore] = useState("");
  const [tipoStruttura, setTipoStruttura] = useState("");
  const [hMax, setHMax] = useState("");
  const [isolante, setIsolante] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [umBase, setUmBase] = useState("mq");

  const mut = useMutation({
    mutationFn: () =>
      createKit({
        nome: nome.trim(),
        famiglia,
       spessore: spessore ? parseNumeroIt(spessore) : null,
        tipo_struttura: tipoStruttura || null,
        h_max: hMax ? parseNumeroIt(hMax) : null,
        isolante: isolante || null,
        descrizione_tecnica: descrizione || null,
        um_base: umBase || "mq",
      }),
    onSuccess: (k) => {
      qc.invalidateQueries({ queryKey: ["kits"] });
      toast.success("Kit creato");
      onOpenChange(false);
      navigate({ to: "/kit/$id", params: { id: k.id } });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo kit / lavorazione</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Parete 100/75 EI60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Famiglia</Label>
              <Select value={famiglia} onValueChange={(v) => setFamiglia(v as KitFamiglia)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAMIGLIE_KIT.map((f) => (
                    <SelectItem key={f} value={f}>{FAMIGLIA_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>U.M. base</Label>
              <Input value={umBase} onChange={(e) => setUmBase(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Spessore (mm)</Label>
              <Input type="text" inputMode="decimal" value={spessore} onChange={(e) => setSpessore(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo struttura</Label>
              <Input value={tipoStruttura} onChange={(e) => setTipoStruttura(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>H. max (m)</Label>
              <Input type="text" inputMode="decimal" value={hMax} onChange={(e) => setHMax(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Isolante</Label>
            <Input value={isolante} onChange={(e) => setIsolante(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrizione tecnica</Label>
            <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => mut.mutate()} disabled={!nome.trim() || mut.isPending}>
            Crea kit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
