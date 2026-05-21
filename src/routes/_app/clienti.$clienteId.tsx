import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Plus, Mail, Phone, Smartphone, Star, Trash2, FileCheck2, FileX2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/clienti/$clienteId")({
  component: ClienteDetail,
});

const contattoSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().max(100).optional().or(z.literal("")),
  ruolo: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  cellulare: z.string().trim().max(30).optional().or(z.literal("")),
  principale: z.boolean().default(false),
});

type ContattoForm = z.infer<typeof contattoSchema>;

function ClienteDetail() {
  const { clienteId } = Route.useParams();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("*, stores(nome, codice)")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contatti, isLoading: loadingContatti } = useQuery({
    queryKey: ["contatti", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const deleteContatto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contatti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto eliminato");
      qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente non trovato</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/clienti">Torna ai clienti</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/clienti"><ArrowLeft className="size-4" /> Clienti</Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{cliente.ragione_sociale}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cliente.partita_iva ? `P.IVA ${cliente.partita_iva}` : "Partita IVA non inserita"}
            </p>
          </div>
          <div className="flex gap-2">
            {cliente.privacy_firmata ? (
              <Badge className="bg-success/15 text-success gap-1">
                <FileCheck2 className="size-3" /> Privacy firmata
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <FileX2 className="size-3" /> Privacy da firmare
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="anagrafica">
        <TabsList>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contatti">Contatti ({contatti?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Dati anagrafici</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Ragione sociale" value={cliente.ragione_sociale} />
              <Field label="Partita IVA" value={cliente.partita_iva} />
              <Field label="Codice fiscale" value={cliente.codice_fiscale} />
              <Field label="Punto vendita" value={(cliente as any).stores?.nome} />
              <Field label="Indirizzo" value={cliente.indirizzo} />
              <Field label="Città" value={cliente.citta && `${cliente.citta}${cliente.provincia ? ` (${cliente.provincia})` : ""}${cliente.cap ? ` — ${cliente.cap}` : ""}`} />
              <Field label="Telefono" value={cliente.telefono} />
              <Field label="Email" value={cliente.email} />
            </dl>
            {cliente.note && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">NOTE</p>
                <p className="text-sm whitespace-pre-wrap">{cliente.note}</p>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="contatti" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" /> Nuovo contatto
                </Button>
              </DialogTrigger>
              <NewContattoDialog clienteId={clienteId} onClose={() => setOpenNew(false)} />
            </Dialog>
          </div>

          {loadingContatti ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : contatti?.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="font-medium text-sm">Nessun contatto</p>
              <p className="text-xs text-muted-foreground mt-1">Aggiungi un referente per questo cliente.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contatti?.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{c.nome} {c.cognome}</p>
                        {c.principale && (
                          <Badge className="bg-accent/15 text-accent gap-1 shrink-0">
                            <Star className="size-3 fill-current" /> Principale
                          </Badge>
                        )}
                      </div>
                      {c.ruolo && <p className="text-xs text-muted-foreground mt-0.5">{c.ruolo}</p>}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { if (confirm("Eliminare questo contatto?")) deleteContatto.mutate(c.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Mail className="size-3.5" /> {c.email}
                      </a>
                    )}
                    {c.telefono && (
                      <a href={`tel:${c.telefono}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Phone className="size-3.5" /> {c.telefono}
                      </a>
                    )}
                    {c.cellulare && (
                      <a href={`tel:${c.cellulare}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <Smartphone className="size-3.5" /> {c.cellulare}
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacyTab cliente={cliente} onUpdated={() => qc.invalidateQueries({ queryKey: ["cliente", clienteId] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function NewContattoDialog({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContattoForm>({
    nome: "", cognome: "", ruolo: "", email: "", telefono: "", cellulare: "", principale: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (input: ContattoForm) => {
      const parsed = contattoSchema.parse(input);
      const payload = {
        cliente_id: clienteId,
        nome: parsed.nome,
        cognome: parsed.cognome || null,
        ruolo: parsed.ruolo || null,
        email: parsed.email || null,
        telefono: parsed.telefono || null,
        cellulare: parsed.cellulare || null,
        principale: parsed.principale,
      };
      const { error } = await supabase.from("contatti").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto aggiunto");
      qc.invalidateQueries({ queryKey: ["contatti", clienteId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = contattoSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  function set<K extends keyof ContattoForm>(k: K, v: ContattoForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuovo contatto</DialogTitle>
        <DialogDescription>Aggiungi un referente per questo cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cognome">Cognome</Label>
            <Input id="cognome" value={form.cognome} onChange={(e) => set("cognome", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ruolo">Ruolo</Label>
          <Input id="ruolo" placeholder="es. Responsabile acquisti" value={form.ruolo} onChange={(e) => set("ruolo", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cellulare">Cellulare</Label>
            <Input id="cellulare" value={form.cellulare} onChange={(e) => set("cellulare", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox id="principale" checked={form.principale} onCheckedChange={(v) => set("principale", v === true)} />
          <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">Contatto principale</Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Aggiungi"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
