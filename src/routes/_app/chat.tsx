import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessagesSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CanaleConversazione } from "@/components/chat/canale-conversazione";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type TipoCanale = Database["public"]["Enums"]["tipo_canale"];

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "Chat — FidiManager" },
      { name: "description", content: "Chat interna per aree, punti vendita e task in FidiManager." },
      { property: "og:title", content: "Chat — FidiManager" },
      { property: "og:description", content: "Chat interna per aree, punti vendita e task in FidiManager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Canale = {
  id: string;
  tipo: TipoCanale;
  nome: string | null;
  attivo: boolean;
  updated_at: string;
  created_by: string | null;
};




function nomeCanale(c: Canale) {
  if (c.nome && c.nome.trim()) return c.nome;
  if (c.tipo === "area") return "Area";
  if (c.tipo === "store") return "Punto vendita";
  if (c.tipo === "task") return "Task";
  return "Messaggio diretto";
}

const TIPO_LABEL: Record<TipoCanale, string> = {
  area: "Area",
  store: "Punto vendita",
  diretto: "Diretto",
  task: "Task",
};

function ChatPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [nuovoCanale, setNuovoCanale] = useState(false);
  const [confermaEliminaChat, setConfermaEliminaChat] = useState<null | "one" | "two">(null);

  const isAdmin = role === "amministratore";

  const { data: canali, isLoading: loadingCanali } = useQuery({
    queryKey: ["chat", "canali", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: membri, error: e1 } = await supabase
        .from("canale_membri")
        .select("canale_id")
        .eq("user_id", user!.id);
      if (e1) throw e1;
      const ids = (membri ?? []).map((m) => m.canale_id);
      if (ids.length === 0) return [] as Canale[];
      const { data, error } = await supabase
        .from("canali")
        .select("id, tipo, nome, attivo, updated_at, created_by")
        .in("id", ids)
        .eq("attivo", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Canale[];
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["chat", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profili").select("id, nome, cognome, attivo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const canaleCorrente = (canali ?? []).find((c) => c.id === selected) ?? null;



  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Conversazioni di area, punto vendita e task.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setNuovoCanale(true)}>
            <Plus className="size-4 mr-1.5" /> Nuovo canale
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Lista canali */}
        <Card className={`p-2 ${selected ? "hidden lg:block" : "block"}`}>
          {loadingCanali ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (canali ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessun canale disponibile
            </div>
          ) : (
            <ul className="space-y-1">
              {(canali ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selected === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessagesSquare className="size-4 shrink-0" />
                      <span className="truncate text-sm font-medium">{nomeCanale(c)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground pl-6">
                      {TIPO_LABEL[c.tipo]}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Conversazione */}
        <Card className={`flex flex-col min-h-[60vh] ${selected ? "flex" : "hidden lg:flex"}`}>
          {!canaleCorrente ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">
              Seleziona un canale per iniziare
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="size-4 mr-1" /> Canali
                </Button>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{nomeCanale(canaleCorrente)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {TIPO_LABEL[canaleCorrente.tipo]}
                  </div>
                </div>
                {canaleCorrente.tipo !== "task" &&
                  (isAdmin || canaleCorrente.created_by === user?.id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => setConfermaEliminaChat("one")}
                    >
                      <Trash2 className="size-4 mr-1.5" /> Elimina chat
                    </Button>
                  )}
              </div>


              <CanaleConversazione canaleId={canaleCorrente.id} />

            </>
          )}
        </Card>
      </div>

      {isAdmin && (
        <NuovoCanaleDialog
          open={nuovoCanale}
          onOpenChange={setNuovoCanale}
          currentUserId={user?.id ?? null}
          profili={(profili ?? []).filter((p) => p.attivo)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["chat", "canali"] });
          }}
        />
      )}
    </div>
  );
}

function NuovoCanaleDialog({
  open,
  onOpenChange,
  currentUserId,
  profili,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string | null;
  profili: Array<{ id: string; nome: string | null; cognome: string | null }>;
  onCreated: () => void;
}) {
  const [tipo, setTipo] = useState<"area" | "store">("area");
  const [areaId, setAreaId] = useState<string>("");
  const [storeId, setStoreId] = useState<string>("");
  const [nome, setNome] = useState("");
  const [membri, setMembri] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("area");
      setAreaId("");
      setStoreId("");
      setNome("");
      setMembri(currentUserId ? [currentUserId] : []);
    }
  }, [open, currentUserId]);

  const { data: aree } = useQuery({
    queryKey: ["chat", "aree-attive"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aree_funzionali")
        .select("id, nome, attiva")
        .eq("attiva", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["chat", "stores-attivi"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, nome, codice, attivo")
        .eq("attivo", true)
        .order("codice");
      if (error) throw error;
      return data ?? [];
    },
  });

  function toggleMembro(id: string) {
    setMembri((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function salva() {
    if (tipo === "area" && !areaId) {
      toast.error("Seleziona un'area");
      return;
    }
    if (tipo === "store" && !storeId) {
      toast.error("Seleziona un punto vendita");
      return;
    }
    if (membri.length === 0) {
      toast.error("Seleziona almeno un membro");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("canali")
      .insert({
        tipo,
        area_id: tipo === "area" ? areaId : null,
        store_id: tipo === "store" ? storeId : null,
        nome: nome.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error("Errore nella creazione del canale");
      return;
    }
    const { error: e2 } = await supabase
      .from("canale_membri")
      .insert(membri.map((user_id) => ({ canale_id: data.id, user_id })));
    setSaving(false);
    if (e2) {
      toast.error("Canale creato ma errore nell'aggiunta dei membri");
    } else {
      toast.success("Canale creato");
    }
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo canale</DialogTitle>
          <DialogDescription>Crea un canale di area o punto vendita e scegli i membri.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "area" | "store")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="area">Area</SelectItem>
                <SelectItem value="store">Punto vendita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "area" ? (
            <div className="space-y-1.5">
              <Label>Area</Label>
              <Select
                value={areaId}
                onValueChange={(v) => {
                  setAreaId(v);
                  const a = (aree ?? []).find((x) => x.id === v);
                  if (a) setNome(a.nome);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona area" /></SelectTrigger>
                <SelectContent>
                  {(aree ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Punto vendita</Label>
              <Select
                value={storeId}
                onValueChange={(v) => {
                  setStoreId(v);
                  const s = (stores ?? []).find((x) => x.id === v);
                  if (s) setNome(s.nome);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona punto vendita" /></SelectTrigger>
                <SelectContent>
                  {(stores ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nome canale</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome del canale" />
          </div>

          <div className="space-y-1.5">
            <Label>Membri</Label>
            <div className="max-h-52 overflow-y-auto rounded-md border p-2 space-y-1">
              {profili.map((p) => {
                const label = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—";
                return (
                  <label key={p.id} className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer">
                    <Checkbox
                      checked={membri.includes(p.id)}
                      onCheckedChange={() => toggleMembro(p.id)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>Crea canale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
