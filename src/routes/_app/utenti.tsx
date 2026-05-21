import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

type UserRow = {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  store_id: string | null;
  attivo: boolean;
  role: AppRole | null;
  store_nome: string | null;
};

function UtentiPage() {
  const { role, loading } = useAuth();
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data: utenti, isLoading } = useQuery({
    queryKey: ["utenti"],
    queryFn: async () => {
      const [{ data: profili, error: e1 }, { data: roles, error: e2 }, { data: stores, error: e3 }] = await Promise.all([
        supabase.from("profili").select("*").order("cognome"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("stores").select("id, nome, codice"),
      ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
      const ordine: AppRole[] = ["amministratore", "approvatore_liv3", "approvatore_liv2", "approvatore_liv1", "store_manager"];
      return (profili ?? []).map((p) => {
        const userRoles = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole);
        const topRole = ordine.find((o) => userRoles.includes(o)) ?? null;
        const store = stores?.find((s) => s.id === p.store_id);
        return { ...p, role: topRole, store_nome: store ? `${store.codice} — ${store.nome}` : null } as UserRow;
      });
    },
  });

  if (!loading && role !== "amministratore") {
    return <Card className="p-8 text-center"><p className="font-medium">Accesso riservato agli amministratori</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Utenti</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestisci ruoli e assegnazione ai punti vendita</p>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <UsersRound className="size-4" /> Tutti gli utenti ({utenti?.length ?? 0})
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Per aggiungere nuovi utenti devono registrarsi dalla pagina di login. Dopo la registrazione potrai modificarne ruolo e punto vendita.
        </p>
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
                  <TableHead>Ruolo</TableHead>
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
                    <TableCell><Badge variant="outline">{u.role ? RUOLI_LABEL[u.role] : "—"}</Badge></TableCell>
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
    </div>
  );
}

function EditUtenteDialog({ utente, onClose }: { utente: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [ruolo, setRuolo] = useState<AppRole>(utente.role ?? "store_manager");
  const [storeId, setStoreId] = useState<string>(utente.store_id ?? "_none");
  const [attivo, setAttivo] = useState(utente.attivo);

  const { data: stores } = useQuery({
    queryKey: ["stores", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("codice");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // Aggiorna profilo
      const { error: e1 } = await supabase.from("profili")
        .update({ store_id: storeId === "_none" ? null : storeId, attivo })
        .eq("id", utente.id);
      if (e1) throw e1;

      // Aggiorna ruolo: cancella tutti e reinserisce
      if (ruolo !== utente.role) {
        const { error: eDel } = await supabase.from("user_roles").delete().eq("user_id", utente.id);
        if (eDel) throw eDel;
        const { error: eIns } = await supabase.from("user_roles").insert({ user_id: utente.id, role: ruolo });
        if (eIns) throw eIns;
      }
    },
    onSuccess: () => {
      toast.success("Utente aggiornato");
      qc.invalidateQueries({ queryKey: ["utenti"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Modifica utente</DialogTitle>
        <DialogDescription>{utente.email}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Ruolo</Label>
          <Select value={ruolo} onValueChange={(v) => setRuolo(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RUOLI_LABEL) as AppRole[]).map((r) => (
                <SelectItem key={r} value={r}>{RUOLI_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Punto vendita</Label>
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
          <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} className="size-4 rounded" />
          Utente attivo
        </label>
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
