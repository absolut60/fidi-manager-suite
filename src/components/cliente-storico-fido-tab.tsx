import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, History, TrendingUp, TrendingDown, RotateCw, Pause, Ban, FilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type TipoVar = "nuovo" | "aumento" | "diminuzione" | "rinnovo" | "sospensione" | "revoca";

const TIPI: { value: TipoVar; label: string; icon: React.ElementType; color: string }[] = [
  { value: "nuovo", label: "Nuovo fido", icon: FilePlus, color: "bg-primary/15 text-primary" },
  { value: "aumento", label: "Aumento", icon: TrendingUp, color: "bg-success/15 text-success" },
  { value: "diminuzione", label: "Diminuzione", icon: TrendingDown, color: "bg-warning/15 text-warning" },
  { value: "rinnovo", label: "Rinnovo", icon: RotateCw, color: "bg-accent/15 text-accent" },
  { value: "sospensione", label: "Sospensione", icon: Pause, color: "bg-muted text-muted-foreground" },
  { value: "revoca", label: "Revoca", icon: Ban, color: "bg-destructive/15 text-destructive" },
];

const schema = z.object({
  tipo_variazione: z.enum(["nuovo", "aumento", "diminuzione", "rinnovo", "sospensione", "revoca"]),
  importo_nuovo: z.coerce.number().min(0, "Deve essere >= 0").max(99999999),
  importo_precedente: z.union([z.coerce.number().min(0).max(99999999), z.literal("")]).optional(),
  data_inizio_fido: z.string().optional().or(z.literal("")),
  data_scadenza_fido: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

type Form = z.infer<typeof schema>;

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function ClienteStoricoFidoTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["storico-fido", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storico_fido")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Registro immutabile di tutte le variazioni del fido del cliente.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" /> Nuova variazione
            </Button>
          </DialogTrigger>
          <NuovaVariazioneDialog
            clienteId={clienteId}
            onClose={() => setOpen(false)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["storico-fido", clienteId] })}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : data?.length === 0 ? (
        <Card className="p-12 text-center">
          <History className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessuna variazione registrata</p>
          <p className="text-xs text-muted-foreground mt-1">
            Le approvazioni dei fidi vengono tracciate qui.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data?.map((v) => {
            const meta = TIPI.find((t) => t.value === v.tipo_variazione) ?? TIPI[0];
            const Icon = meta.icon;
            const delta = v.importo_precedente != null
              ? Number(v.importo_nuovo) - Number(v.importo_precedente)
              : null;
            return (
              <Card key={v.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`size-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="text-lg font-bold">{fmt.format(Number(v.importo_nuovo))}</span>
                        {delta != null && delta !== 0 && (
                          <Badge variant="outline" className={delta > 0 ? "text-success" : "text-warning"}>
                            {delta > 0 ? "+" : ""}{fmt.format(delta)}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString("it-IT")}
                      </span>
                    </div>
                    {(v.data_inizio_fido || v.data_scadenza_fido) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {v.data_inizio_fido && `dal ${new Date(v.data_inizio_fido).toLocaleDateString("it-IT")}`}
                        {v.data_scadenza_fido && ` al ${new Date(v.data_scadenza_fido).toLocaleDateString("it-IT")}`}
                      </div>
                    )}
                    {v.note && <p className="text-sm mt-1 whitespace-pre-wrap">{v.note}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NuovaVariazioneDialog({
  clienteId, onClose, onSaved,
}: { clienteId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>({
    tipo_variazione: "nuovo",
    importo_nuovo: 0,
    importo_precedente: "",
    data_inizio_fido: "",
    data_scadenza_fido: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: async (input: Form) => {
      const parsed = schema.parse(input);
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        cliente_id: clienteId,
        tipo_variazione: parsed.tipo_variazione,
        importo_nuovo: parsed.importo_nuovo,
        importo_precedente: parsed.importo_precedente === "" || parsed.importo_precedente == null
          ? null : parsed.importo_precedente,
        data_inizio_fido: parsed.data_inizio_fido || null,
        data_scadenza_fido: parsed.data_scadenza_fido || null,
        note: parsed.note || null,
        eseguito_da: user?.id ?? null,
      };
      const { error } = await supabase.from("storico_fido").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Variazione registrata");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate(form);
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuova variazione fido</DialogTitle>
        <DialogDescription>Registra manualmente una variazione del fido del cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Tipo variazione *</Label>
          <select
            value={form.tipo_variazione}
            onChange={(e) => set("tipo_variazione", e.target.value as TipoVar)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {TIPI.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Importo precedente</Label>
            <Input
              type="number"
              min={0}
              value={form.importo_precedente ?? ""}
              onChange={(e) => set("importo_precedente", e.target.value === "" ? "" : (Number(e.target.value) as any))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Importo nuovo *</Label>
            <Input
              type="number"
              min={0}
              value={form.importo_nuovo}
              onChange={(e) => set("importo_nuovo", Number(e.target.value))}
            />
            {errors.importo_nuovo && <p className="text-xs text-destructive">{errors.importo_nuovo}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Data inizio</Label>
            <Input type="date" value={form.data_inizio_fido} onChange={(e) => set("data_inizio_fido", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data scadenza</Label>
            <Input type="date" value={form.data_scadenza_fido} onChange={(e) => set("data_scadenza_fido", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Salvataggio..." : "Registra"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
