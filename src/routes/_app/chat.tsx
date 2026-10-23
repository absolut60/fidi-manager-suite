import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessagesSquare, Plus, Trash2, Users } from "lucide-react";
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
  validateSearch: (search: Record<string, unknown>): { canale?: string } => ({
    canale: typeof search.canale === "string" ? search.canale : undefined,
  }),
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

type Profilo = { id: string; nome: string | null; cognome: string | null };

function labelProfilo(p: Profilo | undefined) {
  if (!p) return "";
  return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
}

function nomeCanale(c: Canale, nomiDiretti?: Record<string, string>) {
  if (c.tipo === "diretto") {
    const n = nomiDiretti?.[c.id];
    return n && n.trim() ? n : "Messaggio diretto";
  }
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
  const { user, role, roles } = useAuth();
  const queryClient = useQueryClient();
  const { canale: canaleParam } = Route.useSearch();
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
        .neq("tipo", "task")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Canale[];
    },
  });

  const { data: nonLetti } = useQuery({
    queryKey: ["chat", "non-letti", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_canali_non_letti");
      if (error) throw error;
      return (data ?? []) as Array<{ canale_id: string; non_letti: number }>;
    },
  });

  const nonLettiMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of nonLetti ?? []) out[r.canale_id] = Number(r.non_letti ?? 0);
    return out;
  }, [nonLetti]);

  // Deep link ?canale=<id>
  useEffect(() => {
    if (!canaleParam) return;
    if ((canali ?? []).some((c) => c.id === canaleParam)) setSelected(canaleParam);
  }, [canaleParam, canali]);

  // FM45: la lettura del canale la segna CanaleConversazione (fonte unica).



  const { data: profili } = useQuery({
    queryKey: ["chat", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profili").select("id, nome, cognome, attivo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rubrica } = useQuery({
    queryKey: ["chat", "utenti-rubrica", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_utenti_chat");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string | null; cognome: string | null }>;
    },
  });

  const direttiIds = useMemo(
    () => (canali ?? []).filter((c) => c.tipo === "diretto").map((c) => c.id),
    [canali],
  );

  const { data: membriDiretti } = useQuery({
    queryKey: ["chat", "membri-diretti", direttiIds.join(",")],
    enabled: direttiIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canale_membri")
        .select("canale_id, user_id")
        .in("canale_id", direttiIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nomiDiretti = useMemo(() => {
    const byId = new Map((rubrica ?? []).map((p) => [p.id, p as Profilo]));
    const out: Record<string, string> = {};
    for (const m of membriDiretti ?? []) {
      if (m.user_id === user?.id) continue;
      const label = labelProfilo(byId.get(m.user_id));
      if (label) out[m.canale_id] = label;
    }
    return out;
  }, [membriDiretti, rubrica, user?.id]);

  const canaleCorrente = (canali ?? []).find((c) => c.id === selected) ?? null;
  const [partecipantiOpen, setPartecipantiOpen] = useState(false);
  const puoGestirePartecipanti =
    !!canaleCorrente &&
    (canaleCorrente.tipo === "area" || canaleCorrente.tipo === "store") &&
    (roles ?? []).includes("amministratore");

  async function eliminaChat() {
    if (!canaleCorrente) return;
    const { data, error } = await supabase.rpc("elimina_canale", {
      _canale_id: canaleCorrente.id,
    } as never);
    if (error) {
      toast.error("Impossibile eliminare la chat");
      return;
    }
    const paths = ((data ?? []) as Array<{ storage_path: string | null }>)
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: sErr } = await supabase.storage.from("allegati").remove(paths);
      if (sErr) console.warn("[chat] rimozione allegati fallita", sErr);
    }
    setConfermaEliminaChat(null);
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: ["chat", "canali"] });
    toast.success("Chat eliminata");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Conversazioni di area, punto vendita e task.
          </p>
        </div>
        <Button onClick={() => setNuovoCanale(true)}>
          <Plus className="size-4 mr-1.5" /> Nuovo canale
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Lista canali */}
        <Card className={`p-2 min-w-0 ${selected ? "hidden lg:block" : "block"}`}>
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
                      <span className="truncate text-sm font-medium">{nomeCanale(c, nomiDiretti)}</span>
                      {(nonLettiMap[c.id] ?? 0) > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none px-1.5 py-1 min-w-[18px] text-center">
                          {nonLettiMap[c.id]! > 9 ? "9+" : nonLettiMap[c.id]}
                        </span>
                      )}
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
        <Card className={`flex flex-col min-w-0 min-h-[60vh] ${selected ? "flex" : "hidden lg:flex"}`}>
          {!canaleCorrente ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">
              Seleziona un canale per iniziare
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-3 sm:px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden shrink-0"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="size-4 mr-1" /> Canali
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" title={nomeCanale(canaleCorrente, nomiDiretti)}>
                    {nomeCanale(canaleCorrente, nomiDiretti)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {TIPO_LABEL[canaleCorrente.tipo]}
                  </div>
                </div>
                {puoGestirePartecipanti && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-10 sm:h-9"
                    onClick={() => setPartecipantiOpen(true)}
                    aria-label="Gestisci canale"
                    title="Gestisci canale"
                  >
                    <Users className="size-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Partecipanti</span>
                  </Button>
                )}
                {canaleCorrente.tipo !== "task" &&
                  (isAdmin || canaleCorrente.created_by === user?.id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-10 sm:h-9 text-destructive hover:text-destructive"
                      onClick={() => setConfermaEliminaChat("one")}
                      aria-label="Elimina chat"
                      title="Elimina chat"
                    >
                      <Trash2 className="size-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Elimina chat</span>
                    </Button>
                  )}
              </div>

              <CanaleConversazione canaleId={canaleCorrente.id} />
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={confermaEliminaChat !== null}
        onOpenChange={(v) => { if (!v) setConfermaEliminaChat(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confermaEliminaChat === "two" ? "Conferma definitiva" : "Elimina chat"}
            </DialogTitle>
            <DialogDescription>
              {confermaEliminaChat === "two"
                ? "Confermi l'eliminazione definitiva della chat e di tutti i suoi contenuti?"
                : `Vuoi eliminare la chat "${canaleCorrente ? nomeCanale(canaleCorrente, nomiDiretti) : ""}"? Verranno eliminati tutti i messaggi e gli allegati. L'operazione è irreversibile.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfermaEliminaChat(null)}>Annulla</Button>
            {confermaEliminaChat === "two" ? (
              <Button variant="destructive" onClick={() => void eliminaChat()}>
                Elimina definitivamente
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setConfermaEliminaChat("two")}>
                Continua
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NuovoCanaleDialog
        open={nuovoCanale}
        onOpenChange={setNuovoCanale}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
        profili={(profili ?? []).filter((p) => p.attivo)}
        rubrica={(rubrica ?? [])}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["chat", "canali"] });
        }}
        onOpenCanale={(canaleId) => {
          setSelected(canaleId);
          queryClient.invalidateQueries({ queryKey: ["chat", "canali"] });
        }}
      />

      {canaleCorrente && puoGestirePartecipanti && (
        <GestisciPartecipantiDialog
          open={partecipantiOpen}
          onOpenChange={setPartecipantiOpen}
          canaleId={canaleCorrente.id}
          nomeAttuale={canaleCorrente.nome}
          currentUserId={user?.id ?? null}
          profili={(profili ?? []).filter((p) => p.attivo)}
          onRimossoSeStesso={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function GestisciPartecipantiDialog({
  open, onOpenChange, canaleId, nomeAttuale, currentUserId, profili, onRimossoSeStesso,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canaleId: string;
  nomeAttuale: string | null;
  currentUserId: string | null;
  profili: Array<{ id: string; nome: string | null; cognome: string | null }>;
  onRimossoSeStesso: () => void;
}) {
  const queryClient = useQueryClient();
  const [cerca, setCerca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvo, setSalvo] = useState(false);
  const [nomeInserito, setNomeInserito] = useState(nomeAttuale ?? "");
  const membriKey = ["chat", "canale-membri", canaleId] as const;

  const { data: membri, isLoading } = useQuery({
    queryKey: membriKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("canale_membri").select("user_id").eq("canale_id", canaleId);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });

  useEffect(() => {
    if (open && membri) setSel(new Set(membri));
    if (open) setCerca("");
  }, [open, membri]);

  // Il campo nome si precarica all'apertura (e se il nome nel database cambia).
  useEffect(() => {
    if (open) setNomeInserito(nomeAttuale ?? "");
  }, [open, nomeAttuale]);

  const nome = (p: { nome: string | null; cognome: string | null }) =>
    `${p.cognome ?? ""} ${p.nome ?? ""}`.trim() || "—";
  const byId = useMemo(() => new Map(profili.map((p) => [p.id, p])), [profili]);
  const ordinati = useMemo(
    () =>
      [...profili].sort(
        (a, b) =>
          (a.cognome ?? "").localeCompare(b.cognome ?? "", "it") ||
          (a.nome ?? "").localeCompare(b.nome ?? "", "it"),
      ),
    [profili],
  );
  const filtrati = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    if (!t) return ordinati;
    return ordinati.filter((p) => `${p.nome ?? ""} ${p.cognome ?? ""} ${p.cognome ?? ""}`.toLowerCase().includes(t));
  }, [ordinati, cerca]);

  const iniziali = useMemo(() => new Set(membri ?? []), [membri]);
  const aggiunti = [...sel].filter((id) => !iniziali.has(id));
  const rimossi = [...iniziali].filter((id) => !sel.has(id));
  const nomeTrim = nomeInserito.trim();
  const nomeVecchio = (nomeAttuale ?? "").trim();
  const nomeCambiato = nomeTrim !== nomeVecchio;
  const nomeVuoto = nomeTrim.length === 0;
  const modificato = aggiunti.length > 0 || rimossi.length > 0 || nomeCambiato;
  const vuoto = sel.size === 0;
  const rimuovoMe = !!currentUserId && rimossi.includes(currentUserId);
  const etichetta = (id: string) => { const p = byId.get(id); return p ? nome(p) : "Utente"; };

  function toggle(id: string, v: boolean) {
    setSel((prev) => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n; });
  }

  async function salva() {
    if (!modificato || vuoto || nomeVuoto || salvo) return;
    setSalvo(true);
    let insOk = true, delOk = true, nomeOk = true;
    if (nomeCambiato) {
      const { error } = await supabase.from("canali").update({ nome: nomeTrim }).eq("id", canaleId);
      nomeOk = !error;
    }
    if (aggiunti.length > 0) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("canale_membri").insert(
        aggiunti.map((user_id) => ({ canale_id: canaleId, user_id, ultimo_letto_at: now })) as never,
      );
      insOk = !error;
    }
    if (rimossi.length > 0) {
      const { error } = await supabase.from("canale_membri").delete().eq("canale_id", canaleId).in("user_id", rimossi);
      delOk = !error;
    }
    setSalvo(false);
    queryClient.invalidateQueries({ queryKey: ["chat", "canali"] });
    queryClient.invalidateQueries({ queryKey: ["chat", "non-letti"] });
    queryClient.invalidateQueries({ queryKey: membriKey });
    if (insOk && delOk && nomeOk) {
      toast.success(nomeCambiato ? "Canale aggiornato" : "Partecipanti aggiornati");
      onOpenChange(false);
      if (rimuovoMe) onRimossoSeStesso();
      return;
    }
    const riusciti: string[] = [];
    const falliti: string[] = [];
    if (nomeCambiato) (nomeOk ? riusciti : falliti).push("il nome");
    if (aggiunti.length > 0) (insOk ? riusciti : falliti).push("i nuovi partecipanti");
    if (rimossi.length > 0) (delOk ? riusciti : falliti).push("le rimozioni");
    toast.error(
      `Non salvato: ${falliti.join(", ")}.${riusciti.length ? ` Salvato: ${riusciti.join(", ")}.` : ""}`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestisci canale</DialogTitle>
          <DialogDescription>{sel.size} partecipanti</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="chat-canale-nome" className="text-xs text-muted-foreground">Nome canale</Label>
          <Input
            id="chat-canale-nome"
            placeholder="Nome del canale"
            value={nomeInserito}
            maxLength={80}
            onChange={(e) => setNomeInserito(e.target.value)}
          />
        </div>
        <Input placeholder="Cerca per nome o cognome…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <div className="max-h-[45vh] overflow-y-auto rounded-md border divide-y min-h-0">
          {isLoading ? (
            <div className="p-3 space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
          ) : filtrati.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Nessun utente trovato</div>
          ) : (
            filtrati.map((p) => (
              <label key={p.id} className="flex items-center gap-3 px-3 min-h-10 py-2 cursor-pointer hover:bg-muted/50">
                <Checkbox checked={sel.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                <span className="text-sm min-w-0 break-words">{nome(p)}</span>
              </label>
            ))
          )}
        </div>
        {modificato && (
          <div className="text-xs space-y-1 break-words">
            {nomeCambiato && (
              <div>
                <span className="font-medium">Nome:</span> {nomeVecchio || "—"} → {nomeTrim || "—"}
              </div>
            )}
            <div>
              <span className="font-medium">Aggiunti:</span> {aggiunti.length ? aggiunti.map(etichetta).join(", ") : "—"}
              {" · "}
              <span className="font-medium">Rimossi:</span> {rimossi.length ? rimossi.map(etichetta).join(", ") : "—"}
            </div>
            {rimuovoMe && <div className="text-destructive">Togli anche te stesso: non vedrai più questa chat</div>}
          </div>
        )}
        {vuoto && !isLoading && (
          <div className="text-xs text-destructive">Il canale deve avere almeno un partecipante</div>
        )}
        {nomeVuoto && (
          <div className="text-xs text-destructive">Il nome del canale non può essere vuoto</div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => void salva()} disabled={!modificato || vuoto || nomeVuoto || salvo}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuovoCanaleDialog({
  open,
  onOpenChange,
  isAdmin,
  currentUserId,
  profili,
  rubrica,
  onCreated,
  onOpenCanale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdmin: boolean;
  currentUserId: string | null;
  profili: Array<{ id: string; nome: string | null; cognome: string | null }>;
  rubrica: Array<{ id: string; nome: string | null; cognome: string | null }>;
  onCreated: () => void;
  onOpenCanale?: (canaleId: string) => void;
}) {
  const [tipo, setTipo] = useState<"area" | "store" | "diretto">("area");
  const [areaId, setAreaId] = useState<string>("");
  const [storeId, setStoreId] = useState<string>("");
  const [nome, setNome] = useState("");
  const [membri, setMembri] = useState<string[]>([]);
  const [ricerca, setRicerca] = useState("");
  const [destinatarioId, setDestinatarioId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo(isAdmin ? "area" : "diretto");
      setAreaId("");
      setStoreId("");
      setNome("");
      setRicerca("");
      setDestinatarioId(null);
      setMembri(currentUserId ? [currentUserId] : []);
    }
  }, [open, currentUserId, isAdmin]);

  const { data: aree } = useQuery({
    queryKey: ["chat", "aree-attive"],
    enabled: open && isAdmin,
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
    enabled: open && isAdmin,
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

  const candidati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return rubrica
      .filter((p) => {
        if (!q) return true;
        return `${p.nome ?? ""} ${p.cognome ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) =>
        `${a.cognome ?? ""}${a.nome ?? ""}`.localeCompare(`${b.cognome ?? ""}${b.nome ?? ""}`),
      );
  }, [rubrica, ricerca]);

  function toggleMembro(id: string) {
    setMembri((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function salva() {
    if (tipo === "diretto") {
      if (!destinatarioId) {
        toast.error("Seleziona una persona");
        return;
      }
      setSaving(true);
      const { data, error } = await supabase.rpc("crea_o_apri_diretto", {
        _altro_user_id: destinatarioId,
      } as never);
      setSaving(false);
      if (error || !data) {
        toast.error("Impossibile aprire la chat");
        return;
      }
      onCreated();
      onOpenChange(false);
      onOpenCanale?.(data as unknown as string);
      return;
    }

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

  const diretto = tipo === "diretto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAdmin ? "Nuovo canale" : "Nuovo messaggio diretto"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Crea un canale di area, punto vendita o un messaggio diretto."
              : "Scegli un collega per aprire una chat diretta."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "area" | "store" | "diretto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="area">Area</SelectItem>
                  <SelectItem value="store">Punto vendita</SelectItem>
                  <SelectItem value="diretto">Diretto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {diretto ? (
            <div className="space-y-1.5">
              <Label>Persona</Label>
              <Input
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                placeholder="Cerca per nome o cognome"
              />
              <div className="max-h-64 overflow-y-auto rounded-md border p-1 space-y-0.5">
                {candidati.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    Nessuna persona trovata
                  </div>
                ) : (
                  candidati.map((p) => {
                    const label = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—";
                    const sel = destinatarioId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDestinatarioId(p.id)}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                          sel ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>
            {diretto ? "Apri chat" : "Crea canale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
