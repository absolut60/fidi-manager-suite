import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/impostazioni")({
  component: ImpostazioniPage,
});

const storeSchema = z.object({
  codice: z.string().trim().min(1, "Obbligatorio").max(20).regex(/^[A-Z0-9_-]+$/i, "Solo lettere, numeri, - _"),
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
});
type StoreForm = z.infer<typeof storeSchema>;
type StoreRow = { id: string; codice: string; nome: string; indirizzo: string | null; citta: string | null; telefono: string | null; attivo: boolean };

function ImpostazioniPage() {
  const { role, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreRow | null>(null);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("codice");
      if (error) throw error;
      return data as StoreRow[];
    },
  });

  if (!loading && role !== "amministratore") {
    return <Card className="p-8 text-center"><p className="font-medium">Accesso riservato agli amministratori</p></Card>;
  }

  function openEdit(s: StoreRow) {
    setEditing(s);
    setOpen(true);
  }

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Impostazioni</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestisci i punti vendita del Gruppo MADE</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-1.5"><Plus className="size-4" /> Nuovo punto vendita</Button>
          </DialogTrigger>
          <StoreDialog editing={editing} onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Building2 className="size-4" /> Punti vendita ({stores?.length ?? 0})
        </h2>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !stores || stores.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-medium">Nessun punto vendita</p>
            <p className="text-xs text-muted-foreground mt-1">Aggiungi i 10 punti vendita del gruppo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.codice}</TableCell>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell className="text-sm">{s.citta || "—"}</TableCell>
                    <TableCell className="text-sm">{s.telefono || "—"}</TableCell>
                    <TableCell><Badge variant={s.attivo ? "default" : "secondary"}>{s.attivo ? "Attivo" : "Inattivo"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StoreDialog({ editing, onClose }: { editing: StoreRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<StoreForm>({
    codice: editing?.codice ?? "",
    nome: editing?.nome ?? "",
    indirizzo: editing?.indirizzo ?? "",
    citta: editing?.citta ?? "",
    telefono: editing?.telefono ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: StoreForm) => {
      const parsed = storeSchema.parse(input);
      const payload = {
        codice: parsed.codice.toUpperCase(),
        nome: parsed.nome,
        indirizzo: parsed.indirizzo || null,
        citta: parsed.citta || null,
        telefono: parsed.telefono || null,
      };
      if (editing) {
        const { error } = await supabase.from("stores").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Punto vendita aggiornato" : "Punto vendita creato");
      qc.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("stores").update({ attivo: !editing.attivo }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      qc.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = storeSchema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Modifica punto vendita" : "Nuovo punto vendita"}</DialogTitle>
        <DialogDescription>Compila i dati del punto vendita.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="codice">Codice *</Label>
            <Input id="codice" value={form.codice} onChange={(e) => setForm({ ...form, codice: e.target.value.toUpperCase() })} placeholder="MADE01" />
            {errors.codice && <p className="text-xs text-destructive">{errors.codice}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="citta">Città</Label>
            <Input id="citta" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          {editing && (
            <Button type="button" variant="outline" className="mr-auto gap-1.5" onClick={() => deleteMutation.mutate()}>
              <Trash2 className="size-4" /> {editing.attivo ? "Disattiva" : "Riattiva"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvataggio..." : "Salva"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
