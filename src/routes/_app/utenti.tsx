import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UsersRound, Pencil, UserPlus, Eye, EyeOff, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { creaUtente, updateUtenteRuoli, aggiornaPassword, inviaCredenziali } from "@/lib/utenti.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export const Route = createFileRoute("/_app/utenti")({
  component: UtentiPage,
});

const ORDINE_RUOLI: AppRole[] = [
  "amministratore",
  "approvatore_liv3",
  "approvatore_liv2",
  "approvatore_liv1",
  "store_manager",
  "agente",
];

const TUTTI_RUOLI: AppRole[] = [
  "amministratore",
  "direzione",
  "amministrazione",
  "store_manager",
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "agente",
];

type UserRow = {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  store_id: string | null;
  codice_agente: string | null;
  attivo: boolean;
  ruoli: AppRole[];
  store_nome: string | null;
};

function UtentiPage() {
  const { role, loading } = useAuth();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: utenti, isLoading } = useQuery({
    queryKey: ["utenti"],
    queryFn: async () => {
      const [{ data: profili, error: e1 }, { data: roles, error: e2 }, { data: stores, error: e3 }] = await Promise.all([
        supabase.from("profili").select("*").order("cognome"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("stores").select("id, nome, codice"),
      ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
      return (profili ?? []).map((p) => {
        const userRoles = (roles ?? [])
          .filter((r) => r.user_id === p.id)
          .map((r) => r.role as AppRole)
          .sort((a, b) => ORDINE_RUOLI.indexOf(a) - ORDINE_RUOLI.indexOf(b));
        const store = stores?.find((s) => s.id === p.store_id);
        return {
          ...p,
          ruoli: userRoles,
          store_nome: store ? `${store.codice} — ${store.nome}` : null,
        } as UserRow;
      });
    },
  });

  if (!loading && role !== "amministratore") {
    return <Card className="p-8 text-center"><p className="font-medium">Accesso riservato agli amministratori</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Utenti</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestisci ruoli e assegnazione ai punti vendita</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <UserPlus className="size-4" /> Nuovo utente
        </Button>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <UsersRound className="size-4" /> Tutti gli utenti ({utenti?.length ?? 0})
        </h2>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !utenti?.length ? (
          <div className="text-center py-10"><p className="text-sm">Nessun utente registrato</p></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruoli</TableHead>
                  <TableHead>Punto vendita</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utenti.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{[u.nome, u.cognome].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.ruoli.length === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          u.ruoli.map((r) => (
                            <Badge key={r} variant="outline">{RUOLI_LABEL[r]}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{u.store_nome || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Badge variant={u.attivo ? "default" : "secondary"}>{u.attivo ? "Attivo" : "Inattivo"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(u)}><Pencil className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <EditUtenteDialog utente={editing} onClose={() => setEditing(null)} />}
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && <NewUtenteDialog onClose={() => setCreating(false)} />}
      </Dialog>
    </div>
  );
}

function RoleCheckboxes({ value, onChange }: { value: AppRole[]; onChange: (v: AppRole[]) => void }) {
  const toggle = (r: AppRole, checked: boolean) => {
    if (checked) onChange(Array.from(new Set([...value, r])));
    else onChange(value.filter((x) => x !== r));
  };
  return (
    <div className="space-y-2 rounded-md border p-3">
      {TUTTI_RUOLI.map((r) => (
        <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={value.includes(r)}
            onCheckedChange={(c) => toggle(r, c === true)}
          />
          {RUOLI_LABEL[r]}
        </label>
      ))}
    </div>
  );
}

function useStores() {
  return useQuery({
    queryKey: ["stores", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("codice");
      if (error) throw error;
      return data;
    },
  });
}

function useAgenti() {
  return useQuery({
    queryKey: ["agenti", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return data;
    },
  });
}

function EditUtenteDialog({ utente, onClose }: { utente: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [nome, setNome] = useState(utente.nome ?? "");
  const [cognome, setCognome] = useState(utente.cognome ?? "");
  const [ruoli, setRuoli] = useState<AppRole[]>(utente.ruoli.length ? utente.ruoli : ["store_manager"]);
  const [storeId, setStoreId] = useState<string>(utente.store_id ?? "_none");
  const [codiceAgente, setCodiceAgente] = useState<string>(utente.codice_agente ?? "_none");
  const [attivo, setAttivo] = useState(utente.attivo);
  const { data: stores } = useStores();
  const { data: agenti } = useAgenti();
  const fn = useServerFn(updateUtenteRuoli);

  const richiedeStore = ruoli.includes("store_manager");
  const richiedeAgente = ruoli.includes("agente");

  const mutation = useMutation({
    mutationFn: async () => {
      if (ruoli.length === 0) throw new Error("Seleziona almeno un ruolo");
      if (richiedeStore && storeId === "_none") throw new Error("Il ruolo Store Manager richiede un punto vendita");
      if (richiedeAgente && codiceAgente === "_none") throw new Error("Il ruolo Agente richiede un agente collegato");
      await fn({ data: {
        userId: utente.id,
        ruoli,
        storeId: storeId === "_none" ? null : storeId,
        codiceAgente: richiedeAgente && codiceAgente !== "_none" ? codiceAgente : null,
        attivo,
        nome: nome.trim(),
        cognome: cognome.trim(),
      }});
    },
    onSuccess: () => {
      toast.success("Utente aggiornato");
      qc.invalidateQueries({ queryKey: ["utenti"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [nuovaPassword, setNuovaPassword] = useState("");
  const [mostraPasswordEdit, setMostraPasswordEdit] = useState(false);
  const fnAggiornaPwd = useServerFn(aggiornaPassword);
  const fnInviaCred = useServerFn(inviaCredenziali);

  async function handleAggiornaPwd() {
    if (nuovaPassword.length < 8) {
      toast.error("La password deve essere di almeno 8 caratteri");
      return;
    }
    try {
      await fnAggiornaPwd({ data: { userId: utente.id, password: nuovaPassword } });
      toast.success("Password aggiornata");
      setNuovaPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore aggiornamento password");
    }
  }

  async function handleInviaCredenziali() {
    if (nuovaPassword.length < 8) {
      toast.error("Inserisci la nuova password (min 8 caratteri) da inviare");
      return;
    }
    try {
      await fnAggiornaPwd({ data: { userId: utente.id, password: nuovaPassword } });
      await fnInviaCred({ data: { userId: utente.id, password: nuovaPassword } });
      toast.success("Credenziali inviate a " + utente.email);
      setNuovaPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore invio credenziali");
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Modifica utente</DialogTitle>
        <DialogDescription>{utente.email}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
          </div>
          <div className="space-y-1.5">
            <Label>Cognome</Label>
            <Input value={cognome} onChange={(e) => setCognome(e.target.value)} placeholder="Cognome" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ruoli (selezione multipla)</Label>
          <RoleCheckboxes value={ruoli} onChange={setRuoli} />
        </div>
        <div className="space-y-1.5">
          <Label>Punto vendita {richiedeStore && <span className="text-destructive">*</span>}</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Nessuno —</SelectItem>
              {stores?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {richiedeAgente && (
          <div className="space-y-1.5">
            <Label>Agente collegato <span className="text-destructive">*</span></Label>
            <Select value={codiceAgente} onValueChange={setCodiceAgente}>
              <SelectTrigger><SelectValue placeholder="Seleziona un agente..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Nessuno —</SelectItem>
                {agenti?.map((a) => (
                  <SelectItem key={a.codice} value={a.codice}>{a.codice} — {a.descrizione}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={attivo} onCheckedChange={(c) => setAttivo(c === true)} />
          Utente attivo
        </label>
        {role === "amministratore" && utente.email && (
          <div className="pt-4 border-t space-y-3">
            <Label className="text-sm font-semibold">Gestione password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={mostraPasswordEdit ? "text" : "password"}
                  value={nuovaPassword}
                  onChange={(e) => setNuovaPassword(e.target.value)}
                  placeholder="Nuova password (min 8 caratteri)"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostraPasswordEdit(!mostraPasswordEdit)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {mostraPasswordEdit ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={handleAggiornaPwd}>
                Aggiorna
              </Button>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={handleInviaCredenziali}>
              <Mail className="size-4" />
              Invia credenziali per email
            </Button>
            <p className="text-xs text-muted-foreground">
              Inserisci la nuova password, poi clicca "Aggiorna" per cambiarla
              oppure "Invia credenziali" per aggiornarla e inviarla via email.
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Salvataggio..." : "Salva"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewUtenteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostraPassword, setMostraPassword] = useState(false);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [ruoli, setRuoli] = useState<AppRole[]>(["store_manager"]);
  const [storeId, setStoreId] = useState<string>("_none");
  const [attivo, setAttivo] = useState(true);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [inviato, setInviato] = useState(false);
  const [inviando, setInviando] = useState(false);
  const { data: stores } = useStores();
  const fn = useServerFn(creaUtente);
  const fnInviaCred = useServerFn(inviaCredenziali);

  const richiedeStore = ruoli.includes("store_manager");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Email obbligatoria");
      if (password.length < 8) throw new Error("Password minimo 8 caratteri");
      if (ruoli.length === 0) throw new Error("Seleziona almeno un ruolo");
      if (richiedeStore && storeId === "_none") throw new Error("Il ruolo Store Manager richiede un punto vendita");
      const res = await fn({ data: {
        email: email.trim(),
        password,
        nome: nome.trim() || undefined,
        cognome: cognome.trim() || undefined,
        ruoli,
        storeId: storeId === "_none" ? null : storeId,
        attivo,
      }});
      return res;
    },
    onSuccess: (res) => {
      toast.success("Utente creato");
      qc.invalidateQueries({ queryKey: ["utenti"] });
      setCreatedUserId(res.userId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleInviaCredenziali() {
    if (!createdUserId) return;
    setInviando(true);
    try {
      await fnInviaCred({ data: { userId: createdUserId, password } });
      toast.success("Credenziali inviate a " + email);
      setInviato(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore invio credenziali");
    } finally {
      setInviando(false);
    }
  }

  if (createdUserId) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Utente creato</DialogTitle>
          <DialogDescription>
            L'utente <strong>{email}</strong> è stato creato con successo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Vuoi inviare via email le credenziali di accesso all'utente?
          </p>
          {inviato && (
            <p className="text-sm text-primary font-medium">✓ Credenziali inviate</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          {!inviato && (
            <Button onClick={handleInviaCredenziali} disabled={inviando} className="gap-2">
              <Mail className="size-4" />
              {inviando ? "Invio..." : "Invia credenziali per email"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuovo utente</DialogTitle>
        <DialogDescription>Imposta email e password. Potrai inviare le credenziali via email subito dopo.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Email <span className="text-destructive">*</span></Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="utente@esempio.it" />
        </div>
        <div className="space-y-1.5">
          <Label>Password <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Input
              type={mostraPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 8 caratteri"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setMostraPassword(!mostraPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {mostraPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cognome</Label>
            <Input value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ruoli (selezione multipla)</Label>
          <RoleCheckboxes value={ruoli} onChange={setRuoli} />
        </div>
        <div className="space-y-1.5">
          <Label>Punto vendita {richiedeStore && <span className="text-destructive">*</span>}</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Nessuno —</SelectItem>
              {stores?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={attivo} onCheckedChange={(c) => setAttivo(c === true)} />
          Utente attivo
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Creazione..." : "Crea utente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
