import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Star, Check, X, Plus, ChevronsUpDown } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/contatti")({
  component: ContattiPage,
});

// ===== Schema & helpers (replicato da clienti.$clienteId.tsx) =====
const contattoSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().max(100).optional().or(z.literal("")),
  ruolo: z.string().trim().max(100).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  cellulare: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  principale: z.boolean().default(false),
});
type ContattoForm = z.infer<typeof contattoSchema>;

function emptyContattoForm(): ContattoForm {
  return {
    nome: "", cognome: "", ruolo: "",
    email: "", telefono: "", cellulare: "", whatsapp: "",
    principale: false,
  };
}

function contattoFormToPayload(parsed: ContattoForm) {
  return {
    nome: parsed.nome,
    cognome: parsed.cognome || null,
    ruolo: parsed.ruolo || null,
    email: parsed.email || null,
    telefono: parsed.telefono || null,
    cellulare: parsed.cellulare || null,
    whatsapp: parsed.whatsapp || null,
    principale: parsed.principale,
  };
}

function ContattoFormFields({
  form, errors, set,
}: {
  form: ContattoForm;
  errors: Record<string, string>;
  set: <K extends keyof ContattoForm>(k: K, v: ContattoForm[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Dati anagrafici</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Cognome</Label>
            <Input value={form.cognome} onChange={(e) => set("cognome", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ruolo</Label>
          <Input placeholder="es. Responsabile acquisti" value={form.ruolo} onChange={(e) => set("ruolo", e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="principale" checked={form.principale} onCheckedChange={(v) => set("principale", v === true)} />
          <Label htmlFor="principale" className="cursor-pointer text-sm font-normal">Contatto principale</Label>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <h4 className="text-sm font-semibold">Recapiti</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Telefono</Label>
            <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cellulare</Label>
            <Input value={form.cellulare} onChange={(e) => set("cellulare", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input placeholder="+39 333 1234567" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CB({ ok }: { ok: boolean }) {
  return ok
    ? <Badge className="bg-success/15 text-success border-success/30"><Check className="size-3" /></Badge>
    : <Badge variant="outline" className="text-muted-foreground"><X className="size-3" /></Badge>;
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

function ContattiPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [clienteId, setClienteId] = useState("all");
  const [statoConsenso, setStatoConsenso] = useState("tutti");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientiOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((c: any) => {
      if (c.clienti) m.set(c.clienti.id, c.clienti.ragione_sociale);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((c: any) => {
      if (storeId !== "all" && c.clienti?.store_id !== storeId) return false;
      if (clienteId !== "all" && c.clienti?.id !== clienteId) return false;
      const n = (c.consenso_profilazione ? 1 : 0)
        + (c.consenso_marketing_media ? 1 : 0)
        + (c.consenso_marketing_diretto ? 1 : 0);
      if (statoConsenso === "almeno_uno" && n === 0) return false;
      if (statoConsenso === "nessuno" && n > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.clienti?.ragione_sociale ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, storeId, clienteId, statoConsenso]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="size-7 text-primary" /> Contatti
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Referenti collegati ai clienti con stato consensi privacy
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="size-4" /> Nuovo contatto
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca nome, email o cliente..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-56">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clientiOptions.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isStoreManager && (
            <div className="w-56">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli store</SelectItem>
                  {stores?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-56">
            <Select value={statoConsenso} onValueChange={setStatoConsenso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i consensi</SelectItem>
                <SelectItem value="almeno_uno">Almeno uno firmato</SelectItem>
                <SelectItem value="nessuno">Nessuno firmato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nessun contatto trovato</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cellulare</TableHead>
                <TableHead className="text-center">Profilaz.</TableHead>
                <TableHead className="text-center">Marketing</TableHead>
                <TableHead className="text-center">WhatsApp</TableHead>
                <TableHead>Data firma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: c.clienti.id },
                    search: { tab: "contatti" },
                  })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.principale && <Star className="size-3 fill-accent text-accent" />}
                      {c.nome} {c.cognome}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.clienti?.ragione_sociale}
                    <div className="text-xs text-muted-foreground">{c.clienti?.stores?.nome ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ruolo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cellulare ?? "—"}</TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_profilazione} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_media} /></TableCell>
                  <TableCell className="text-center"><CB ok={!!c.consenso_marketing_diretto} /></TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.data_firma)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {dialogOpen && (
        <NuovoContattoDialog onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}

function NuovoContattoDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContattoForm>(emptyContattoForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [clienteError, setClienteError] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const set = <K extends keyof ContattoForm>(k: K, v: ContattoForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const { data: clientiList } = useQuery({
    queryKey: ["clienti-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale")
        .eq("attivo", true)
        .order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedCliente = useMemo(
    () => clientiList?.find((c) => c.id === selectedClienteId) ?? null,
    [clientiList, selectedClienteId],
  );

  const mutation = useMutation({
    mutationFn: async (input: ContattoForm) => {
      const parsed = contattoSchema.parse(input);
      const payload = { cliente_id: selectedClienteId!, ...contattoFormToPayload(parsed) };
      const { error } = await supabase.from("contatti").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto creato con successo");
      qc.invalidateQueries({ queryKey: ["contatti-all"] });
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Errore nella creazione del contatto");
    },
  });

  const onSubmit = () => {
    setErrors({});
    setClienteError(null);
    if (!selectedClienteId) {
      setClienteError("Seleziona un cliente");
      return;
    }
    const r = contattoSchema.safeParse(form);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { if (i.path[0]) errs[String(i.path[0])] = i.message; });
      setErrors(errs);
      return;
    }
    mutation.mutate(r.data);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo contatto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente collegato *</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn("w-full justify-between font-normal", !selectedCliente && "text-muted-foreground")}
                >
                  {selectedCliente ? (
                    <span className="truncate">
                      {selectedCliente.ragione_sociale}
                      {selectedCliente.codice_gestionale && (
                        <span className="text-muted-foreground ml-2">{selectedCliente.codice_gestionale}</span>
                      )}
                    </span>
                  ) : (
                    "Cerca cliente per nome o codice..."
                  )}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Cerca cliente per nome o codice..." />
                  <CommandList>
                    <CommandEmpty>Nessun cliente trovato</CommandEmpty>
                    <CommandGroup>
                      {(clientiList ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.ragione_sociale} ${c.codice_gestionale ?? ""}`}
                          onSelect={() => {
                            setSelectedClienteId(c.id);
                            setClienteError(null);
                            setPopoverOpen(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span>{c.ragione_sociale}</span>
                            {c.codice_gestionale && (
                              <span className="text-xs text-muted-foreground">{c.codice_gestionale}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {clienteError && <p className="text-xs text-destructive">{clienteError}</p>}
          </div>

          <div className="border-t pt-4">
            <ContattoFormFields form={form} errors={errors} set={set} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Annulla</Button>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : "Crea contatto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
