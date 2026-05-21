import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Pencil, Construction } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const cantiereSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(200),
  descrizione: z.string().trim().max(1000).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  provincia: z.string().trim().max(5).optional().or(z.literal("")),
  referente: z.string().trim().max(150).optional().or(z.literal("")),
  data_inizio: z.string().optional().or(z.literal("")),
  data_fine_prevista: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  attivo: z.boolean().default(true),
});

type CantiereForm = z.infer<typeof cantiereSchema>;

const empty: CantiereForm = {
  nome: "", descrizione: "", indirizzo: "", citta: "", cap: "", provincia: "",
  referente: "", data_inizio: "", data_fine_prevista: "", note: "", attivo: true,
};

export function ClienteCantieriTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cantieri", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cantieri")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("attivo", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cantieri").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cantiere eliminato");
      qc.invalidateQueries({ queryKey: ["cantieri", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editingCantiere = data?.find((c) => c.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" /> Nuovo cantiere
            </Button>
          </DialogTrigger>
          <CantiereDialog
            clienteId={clienteId}
            mode="new"
            initial={empty}
            onClose={() => setOpenNew(false)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : data?.length === 0 ? (
        <Card className="p-12 text-center">
          <Construction className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessun cantiere</p>
          <p className="text-xs text-muted-foreground mt-1">Aggiungi un cantiere per tracciare le forniture.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{c.nome}</p>
                    {c.attivo ? (
                      <Badge className="bg-success/15 text-success">Attivo</Badge>
                    ) : (
                      <Badge variant="outline">Chiuso</Badge>
                    )}
                  </div>
                  {c.descrizione && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descrizione}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => setEditId(c.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => { if (confirm("Eliminare questo cantiere?")) delMut.mutate(c.id); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {(c.indirizzo || c.citta) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="size-3.5 mt-0.5 shrink-0" />
                    <span>
                      {c.indirizzo}
                      {c.citta && `${c.indirizzo ? ", " : ""}${c.citta}`}
                      {c.provincia && ` (${c.provincia})`}
                      {c.cap && ` — ${c.cap}`}
                    </span>
                  </div>
                )}
                {c.referente && <div>Referente: <span className="text-foreground">{c.referente}</span></div>}
                {(c.data_inizio || c.data_fine_prevista) && (
                  <div>
                    {c.data_inizio && `dal ${new Date(c.data_inizio).toLocaleDateString("it-IT")}`}
                    {c.data_fine_prevista && ` al ${new Date(c.data_fine_prevista).toLocaleDateString("it-IT")}`}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editingCantiere && (
        <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
          <CantiereDialog
            clienteId={clienteId}
            mode="edit"
            cantiereId={editingCantiere.id}
            initial={{
              nome: editingCantiere.nome ?? "",
              descrizione: editingCantiere.descrizione ?? "",
              indirizzo: editingCantiere.indirizzo ?? "",
              citta: editingCantiere.citta ?? "",
              cap: editingCantiere.cap ?? "",
              provincia: editingCantiere.provincia ?? "",
              referente: editingCantiere.referente ?? "",
              data_inizio: editingCantiere.data_inizio ?? "",
              data_fine_prevista: editingCantiere.data_fine_prevista ?? "",
              note: editingCantiere.note ?? "",
              attivo: editingCantiere.attivo ?? true,
            }}
            onClose={() => setEditId(null)}
          />
        </Dialog>
      )}
    </div>
  );
}

function CantiereDialog({
  clienteId, mode, cantiereId, initial, onClose,
}: {
  clienteId: string;
  mode: "new" | "edit";
  cantiereId?: string;
  initial: CantiereForm;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CantiereForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: async (input: CantiereForm) => {
      const parsed = cantiereSchema.parse(input);
      const { data: { user } } = await supabase.auth.getUser();
      const payload: Record<string, any> = {
        cliente_id: clienteId,
        nome: parsed.nome,
        descrizione: parsed.descrizione || null,
        indirizzo: parsed.indirizzo || null,
        citta: parsed.citta || null,
        cap: parsed.cap || null,
        provincia: parsed.provincia || null,
        referente: parsed.referente || null,
        data_inizio: parsed.data_inizio || null,
        data_fine_prevista: parsed.data_fine_prevista || null,
        note: parsed.note || null,
        attivo: parsed.attivo,
      };
      if (mode === "new") {
        payload.created_by = user?.id ?? null;
        const { error } = await supabase.from("cantieri").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cantieri").update(payload).eq("id", cantiereId!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "new" ? "Cantiere creato" : "Cantiere aggiornato");
      qc.invalidateQueries({ queryKey: ["cantieri", clienteId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = cantiereSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mut.mutate(form);
  }

  function set<K extends keyof CantiereForm>(k: K, v: CantiereForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{mode === "new" ? "Nuovo cantiere" : "Modifica cantiere"}</DialogTitle>
        <DialogDescription>Dati del cantiere collegato al cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Nome cantiere *</Label>
          <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Descrizione</Label>
          <Textarea rows={2} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Indirizzo</Label>
            <Input value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Città</Label>
            <Input value={form.citta} onChange={(e) => set("citta", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CAP</Label>
              <Input value={form.cap} onChange={(e) => set("cap", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prov.</Label>
              <Input value={form.provincia} onChange={(e) => set("provincia", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Referente</Label>
            <Input value={form.referente} onChange={(e) => set("referente", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data inizio</Label>
            <Input type="date" value={form.data_inizio} onChange={(e) => set("data_inizio", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fine prevista</Label>
            <Input type="date" value={form.data_fine_prevista} onChange={(e) => set("data_fine_prevista", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="attivo" checked={form.attivo} onCheckedChange={(v) => set("attivo", v === true)} />
          <Label htmlFor="attivo" className="cursor-pointer text-sm font-normal">Cantiere attivo</Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Salvataggio..." : mode === "new" ? "Crea" : "Salva"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
