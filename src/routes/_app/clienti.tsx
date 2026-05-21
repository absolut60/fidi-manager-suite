import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, Building, MapPin, FileCheck2, FileX2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/clienti")({
  component: ClientiPage,
});

const clienteSchema = z.object({
  ragione_sociale: z.string().trim().min(1, "Obbligatorio").max(200),
  partita_iva: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  provincia: z.string().trim().max(5).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  store_id: z.string().uuid().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

type ClienteForm = z.infer<typeof clienteSchema>;

function ClientiPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clienti, isLoading } = useQuery({
    queryKey: ["clienti"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("*, stores(nome, codice)")
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (clienti ?? []).filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.ragione_sociale?.toLowerCase().includes(q) ||
      c.partita_iva?.toLowerCase().includes(q) ||
      c.citta?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anagrafica dei clienti dei punti vendita
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nuovo cliente
            </Button>
          </DialogTrigger>
          <NewClienteDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per ragione sociale, P.IVA o città..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Building className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessun cliente trovato</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Prova un'altra ricerca" : "Inizia aggiungendo il primo cliente"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ragione sociale</TableHead>
                  <TableHead>P. IVA</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Punto vendita</TableHead>
                  <TableHead>Privacy</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        to="/clienti/$clienteId"
                        params={{ clienteId: c.id }}
                        className="hover:text-primary"
                      >
                        {c.ragione_sociale}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.partita_iva || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.citta ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 text-muted-foreground" />
                          {c.citta} {c.provincia ? `(${c.provincia})` : ""}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(c as any).stores?.nome || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {c.privacy_firmata ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/20 gap-1">
                          <FileCheck2 className="size-3" /> Firmata
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <FileX2 className="size-3" /> Da firmare
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.attivo ? "default" : "secondary"}>
                        {c.attivo ? "Attivo" : "Inattivo"}
                      </Badge>
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

function NewClienteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ClienteForm>({
    ragione_sociale: "",
    partita_iva: "",
    codice_fiscale: "",
    indirizzo: "",
    citta: "",
    cap: "",
    provincia: "",
    telefono: "",
    email: "",
    store_id: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome, codice")
        .eq("attivo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: ClienteForm) => {
      const parsed = clienteSchema.parse(input);
      const payload = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v === "" ? null : v]),
      );
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("clienti")
        .insert({ ...payload, created_by: user?.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente creato con successo");
      qc.invalidateQueries({ queryKey: ["clienti"] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante la creazione del cliente");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = clienteSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    mutation.mutate(form);
  }

  function set<K extends keyof ClienteForm>(key: K, value: ClienteForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuovo cliente</DialogTitle>
        <DialogDescription>
          Compila i dati anagrafici. I campi con * sono obbligatori.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ragione_sociale">Ragione sociale *</Label>
          <Input
            id="ragione_sociale"
            value={form.ragione_sociale}
            onChange={(e) => set("ragione_sociale", e.target.value)}
          />
          {errors.ragione_sociale && <p className="text-xs text-destructive">{errors.ragione_sociale}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="partita_iva">Partita IVA</Label>
            <Input id="partita_iva" value={form.partita_iva} onChange={(e) => set("partita_iva", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="codice_fiscale">Codice fiscale</Label>
            <Input id="codice_fiscale" value={form.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="citta">Città</Label>
            <Input id="citta" value={form.citta} onChange={(e) => set("citta", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap">CAP</Label>
            <Input id="cap" value={form.cap} onChange={(e) => set("cap", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provincia">Prov.</Label>
            <Input id="provincia" maxLength={2} value={form.provincia} onChange={(e) => set("provincia", e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="store_id">Punto vendita</Label>
          <Select value={form.store_id || undefined} onValueChange={(v) => set("store_id", v)}>
            <SelectTrigger id="store_id">
              <SelectValue placeholder={stores?.length ? "Seleziona..." : "Nessun punto vendita disponibile"} />
            </SelectTrigger>
            <SelectContent>
              {stores?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.codice} — {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Crea cliente"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
