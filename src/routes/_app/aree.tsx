import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Network, Pencil, Plus, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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

type TipoArea = Database["public"]["Enums"]["tipo_area"];

export const Route = createFileRoute("/_app/aree")({
  component: AreePage,
  head: () => ({
    meta: [
      { title: "Aree funzionali — FidiManager" },
      { name: "description", content: "Gestione delle aree funzionali e dei membri assegnati in FidiManager." },
      { property: "og:title", content: "Aree funzionali — FidiManager" },
      { property: "og:description", content: "Gestione delle aree funzionali e dei membri assegnati in FidiManager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TIPI_AREA: TipoArea[] = ["recupero_crediti", "commerciale", "amministrazione", "magazzino"];

const TIPO_AREA_LABEL: Record<TipoArea, string> = {
  recupero_crediti: "Recupero crediti",
  commerciale: "Commerciale",
  amministrazione: "Amministrazione",
  magazzino: "Magazzino",
};

const TRASVERSALE = "__trasversale__";

type AreaRow = {
  id: string;
  nome: string;
  tipo: TipoArea;
  store_id: string | null;
  attiva: boolean;
  store_label: string | null;
  n_membri: number;
};

function AreePage() {
  const { role, loading } = useAuth();
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [membriArea, setMembriArea] = useState<AreaRow | null>(null);

  const { data: stores } = useQuery({
    queryKey: ["aree", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome, codice, attivo")
        .order("codice");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: aree, isLoading } = useQuery({
    queryKey: ["aree"],
    queryFn: async () => {
      const [{ data: areeData, error: e1 }, { data: membri, error: e2 }, { data: storesData, error: e3 }] =
        await Promise.all([
          supabase.from("aree_funzionali").select("*").order("nome"),
          supabase.from("area_membri").select("area_id"),
          supabase.from("stores").select("id, nome, codice"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return (areeData ?? []).map((a) => {
        const store = storesData?.find((s) => s.id === a.store_id);
        return {
          id: a.id,
          nome: a.nome,
          tipo: a.tipo,
          store_id: a.store_id,
          attiva: a.attiva,
          store_label: store ? `${store.codice} — ${store.nome}` : null,
          n_membri: (membri ?? []).filter((m) => m.area_id === a.id).length,
        } as AreaRow;
      });
    },
  });

  if (!loading && role !== "amministratore") {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato agli amministratori</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Aree funzionali</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci le aree organizzative e le persone che ne fanno parte
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="size-4" /> Nuova area
        </Button>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Network className="size-4" /> Tutte le aree ({aree?.length ?? 0})
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !aree?.length ? (
          <div className="text-center py-10"><p className="text-sm">Nessuna area configurata</p></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ambito</TableHead>
                  <TableHead>N. membri</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aree.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nome}</TableCell>
                    <TableCell>{TIPO_AREA_LABEL[a.tipo]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.store_label ?? "Trasversale"}
                    </TableCell>
                    <TableCell>{a.n_membri}</TableCell>
                    <TableCell>
                      <Badge variant={a.attiva ? "default" : "secondary"}>
                        {a.attiva ? "Attiva" : "Inattiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Gestisci membri" onClick={() => setMembriArea(a)}>
                          <Users className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Modifica area" onClick={() => setEditing(a)}>
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <AreaDialog
          area={editing}
          stores={(stores ?? []).filter((s) => s.attivo || s.id === editing?.store_id)}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {membriArea && (
        <MembriDialog area={membriArea} onClose={() => setMembriArea(null)} />
      )}
    </div>
  );
}

function AreaDialog({
  area,
  stores,
  onClose,
}: {
  area: AreaRow | null;
  stores: Array<{ id: string; nome: string; codice: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(area?.nome ?? "");
  const [tipo, setTipo] = useState<TipoArea>(area?.tipo ?? "commerciale");
  const [storeId, setStoreId] = useState<string>(area?.store_id ?? TRASVERSALE);
  const [attiva, setAttiva] = useState<boolean>(area?.attiva ?? true);

  const salva = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: nome.trim(),
        tipo,
        store_id: storeId === TRASVERSALE ? null : storeId,
        attiva,
      };
      if (area) {
        const { error } = await supabase.from("aree_funzionali").update(payload).eq("id", area.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("aree_funzionali").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(area ? "Area aggiornata" : "Area creata");
      qc.invalidateQueries({ queryKey: ["aree"] });
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{area ? "Modifica area" : "Nuova area"}</DialogTitle>
          <DialogDescription>
            Definisci nome, tipo e ambito dell&apos;area funzionale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="area-nome">Nome</Label>
            <Input
              id="area-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Recupero crediti centrale"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoArea)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPI_AREA.map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_AREA_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ambito</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TRASVERSALE}>Trasversale (tutta l&apos;azienda)</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Di norma Recupero crediti, Commerciale e Amministrazione sono trasversali; il Magazzino è per punto vendita.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="area-attiva"
              checked={attiva}
              onCheckedChange={(c) => setAttiva(c === true)}
            />
            <Label htmlFor="area-attiva" className="font-normal">Area attiva</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => salva.mutate()}
            disabled={!nome.trim() || salva.isPending}
          >
            {salva.isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembriDialog({ area, onClose }: { area: AreaRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [nuovoUserId, setNuovoUserId] = useState<string>("");
  const [nuovoRuolo, setNuovoRuolo] = useState<string>("membro");

  const { data, isLoading } = useQuery({
    queryKey: ["area-membri", area.id],
    queryFn: async () => {
      const [{ data: membri, error: e1 }, { data: profili, error: e2 }] = await Promise.all([
        supabase.from("area_membri").select("id, user_id, ruolo_area").eq("area_id", area.id),
        supabase.from("profili").select("id, nome, cognome, email").eq("attivo", true).order("cognome"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { membri: membri ?? [], profili: profili ?? [] };
    },
  });

  useEffect(() => {
    setNuovoUserId("");
  }, [area.id]);

  const membri = data?.membri ?? [];
  const profili = data?.profili ?? [];
  const disponibili = profili.filter((p) => !membri.some((m) => m.user_id === p.id));

  function nomeUtente(userId: string) {
    const p = profili.find((x) => x.id === userId);
    if (!p) return userId;
    return [p.nome, p.cognome].filter(Boolean).join(" ") || (p.email ?? userId);
  }

  function invalida() {
    qc.invalidateQueries({ queryKey: ["area-membri", area.id] });
    qc.invalidateQueries({ queryKey: ["aree"] });
  }

  const aggiungi = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("area_membri")
        .insert({ area_id: area.id, user_id: nuovoUserId, ruolo_area: nuovoRuolo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Persona aggiunta all'area");
      setNuovoUserId("");
      setNuovoRuolo("membro");
      invalida();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("Questa persona fa già parte dell'area");
      } else {
        toast.error(msg || "Errore durante l'aggiunta");
      }
    },
  });

  const cambiaRuolo = useMutation({
    mutationFn: async ({ id, ruolo }: { id: string; ruolo: string }) => {
      const { error } = await supabase.from("area_membri").update({ ruolo_area: ruolo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ruolo aggiornato"); invalida(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("area_membri").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Persona rimossa"); invalida(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Membri di {area.nome}</DialogTitle>
          <DialogDescription>Gestisci le persone assegnate a questa area funzionale.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {membri.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun membro assegnato</p>
              ) : (
                membri.map((m) => {
                  const p = profili.find((x) => x.id === m.user_id);
                  return (
                    <div key={m.id} className="flex items-center gap-2 rounded-md border p-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{nomeUtente(m.user_id)}</div>
                        <div className="text-xs text-muted-foreground truncate">{p?.email ?? "—"}</div>
                      </div>
                      <Select
                        value={m.ruolo_area}
                        onValueChange={(v) => cambiaRuolo.mutate({ id: m.id, ruolo: v })}
                      >
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="membro">Membro</SelectItem>
                          <SelectItem value="responsabile">Responsabile</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Rimuovi dall'area"
                        onClick={() => rimuovi.mutate(m.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label>Aggiungi persona</Label>
              <div className="flex flex-wrap gap-2">
                <Select value={nuovoUserId} onValueChange={setNuovoUserId}>
                  <SelectTrigger className="flex-1 min-w-48">
                    <SelectValue placeholder="Seleziona una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {disponibili.length === 0 ? (
                      <SelectItem value="__none__" disabled>Nessuna persona disponibile</SelectItem>
                    ) : (
                      disponibili.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {[p.nome, p.cognome].filter(Boolean).join(" ") || p.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Select value={nuovoRuolo} onValueChange={setNuovoRuolo}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="membro">Membro</SelectItem>
                    <SelectItem value="responsabile">Responsabile</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => aggiungi.mutate()}
                  disabled={!nuovoUserId || nuovoUserId === "__none__" || aggiungi.isPending}
                >
                  Aggiungi
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
