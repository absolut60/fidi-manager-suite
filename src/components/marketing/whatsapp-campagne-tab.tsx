import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, Pencil, Trash2, Copy, Users, X, Search, Send, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { avviaInvioCampagnaWhatsapp, riprendiInvioCampagnaWhatsapp } from "@/lib/campagna-whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DEST_PAGE_SIZE = 100;

type CampagnaWa = {
  id: string;
  nome: string;
  stato: string;
  template_id: string | null;
  template_name: string | null;
  evento_id: string | null;
  inviata_at: string | null;
  totale_invii: number | null;
  invii_ok: number | null;
  invii_falliti: number | null;
  saltati: number | null;
  parametri: { fissi?: Record<string, string> } | null;
  created_at: string;
  updated_at: string | null;
};

type TemplateOpt = {
  id: string;
  nome: string;
  stato: string;
  body_testo: string | null;
  pulsanti: any[] | null;
};

type MessaggioRiga = {
  id: string;
  numero_dest: string | null;
  nome_riferimento: string | null;
  cliente_id: string | null;
  stato: string;
  errore: string | null;
  inviato_at: string | null;
  created_at: string;
  clienti?: { ragione_sociale: string | null } | null;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("it-IT"); } catch { return s; }
}

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("it-IT"); } catch { return s; }
}

function statoCampagnaBadge(stato: string) {
  switch (stato) {
    case "pronta":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pronta</Badge>;
    case "in_corso":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Invio in corso</Badge>;
    case "completata":
      return <Badge className="bg-sky-600 text-white hover:bg-sky-600">Completata</Badge>;
    default:
      return <Badge variant="secondary">Bozza</Badge>;
  }
}

function statoMessaggioBadge(s: string) {
  switch (s) {
    case "inviato":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Inviato</Badge>;
    case "consegnato":
      return <Badge className="bg-sky-600 text-white hover:bg-sky-600">Consegnato</Badge>;
    case "letto":
      return <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">Letto</Badge>;
    case "fallito":
      return <Badge variant="destructive">Fallito</Badge>;
    default:
      return <Badge variant="secondary">Da inviare</Badge>;
  }
}

function statoTemplateBadge(stato: string) {
  switch (stato) {
    case "approvato":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Approvato</Badge>;
    case "in_attesa":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">In attesa</Badge>;
    case "rifiutato":
      return <Badge variant="destructive">Rifiutato</Badge>;
    default:
      return <Badge variant="secondary">Bozza</Badge>;
  }
}

export function WhatsAppCampagneTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CampagnaWa | null>(null);
  const [deleting, setDeleting] = useState<CampagnaWa | null>(null);
  const [destinatariDi, setDestinatariDi] = useState<CampagnaWa | null>(null);
  const [avviando, setAvviando] = useState<CampagnaWa | null>(null);

  const { data: campagne, isLoading } = useQuery({
    queryKey: ["campagne_whatsapp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_whatsapp")
        .select("id, nome, stato, template_id, template_name, evento_id, inviata_at, totale_invii, invii_ok, invii_falliti, saltati, parametri, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampagnaWa[];
    },
    refetchInterval: (q) =>
      (q.state.data as CampagnaWa[] | undefined)?.some((c) => c.stato === "in_corso") ? 5000 : false,
  });

  const { data: conteggi } = useQuery({
    queryKey: ["messaggi_whatsapp", "conteggi"],
    queryFn: async () => {
      // TODO: passare a RPC di conteggio se i volumi crescono (limite PostgREST 1000)
      const { data, error } = await supabase.from("messaggi_whatsapp").select("campagna_id, stato");
      if (error) throw error;
      const map = new Map<string, { totale: number; inCoda: number }>();
      for (const r of (data ?? []) as Array<{ campagna_id: string | null; stato: string }>) {
        if (!r.campagna_id) continue;
        const cur = map.get(r.campagna_id) ?? { totale: 0, inCoda: 0 };
        cur.totale += 1;
        if (r.stato === "in_coda") cur.inCoda += 1;
        map.set(r.campagna_id, cur);
      }
      return map;
    },
    refetchInterval: () =>
      campagne?.some((c) => c.stato === "in_corso") ? 5000 : false,
  });

  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["campagne_whatsapp"] });
    qc.invalidateQueries({ queryKey: ["messaggi_whatsapp"] });
  };

  const avvia = useMutation({
    mutationFn: async (c: CampagnaWa) => avviaInvioCampagnaWhatsapp({ data: { campagnaId: c.id } }),
    onSuccess: (r: any) => {
      toast.success(`Invio avviato per ${r?.totale ?? 0} destinatari`);
      invalida();
      setAvviando(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore avvio invio"),
  });

  const riprendi = useMutation({
    mutationFn: async (c: CampagnaWa) => riprendiInvioCampagnaWhatsapp({ data: { campagnaId: c.id } }),
    onSuccess: () => {
      toast.success("Invio ripreso");
      invalida();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore ripresa invio"),
  });

  const crea = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("campagne_whatsapp")
        .insert({
          nome: "Nuova campagna WhatsApp",
          stato: "bozza",
          creata_da: user?.id ?? null,
        })
        .select("id, nome, stato, template_id, template_name, evento_id, inviata_at, totale_invii, invii_ok, invii_falliti, saltati, parametri, created_at, updated_at")
        .single();
      if (error) throw error;
      return data as CampagnaWa;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["campagne_whatsapp"] });
      setEditing(c);
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore creazione campagna"),
  });

  const duplica = useMutation({
    mutationFn: async (c: CampagnaWa) => {
      const { error } = await supabase.from("campagne_whatsapp").insert({
        nome: `${c.nome} (copia)`,
        stato: "bozza",
        template_id: c.template_id,
        template_name: c.template_name,
        evento_id: c.evento_id,
        parametri: c.parametri ?? null,
        creata_da: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna duplicata");
      qc.invalidateQueries({ queryKey: ["campagne_whatsapp"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore duplicazione"),
  });

  const elimina = useMutation({
    mutationFn: async (c: CampagnaWa) => {
      // La FK è ON DELETE SET NULL: rimuovo prima i messaggi, poi la campagna.
      const { error: e1 } = await supabase.from("messaggi_whatsapp").delete().eq("campagna_id", c.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("campagne_whatsapp").delete().eq("id", c.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Campagna eliminata");
      setDeleting(null);
      invalida();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore eliminazione"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle className="size-6" /> Campagne WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea la campagna, scegli il template approvato e raccogli i destinatari dai Segmenti.
          </p>
        </div>
        <Button onClick={() => crea.mutate()} disabled={crea.isPending}>
          <Plus className="size-4 mr-2" /> Nuova campagna
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !campagne?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nessuna campagna WhatsApp salvata.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-center">Destinatari</TableHead>
                <TableHead>Aggiornata</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campagne.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.template_name || "—"}</TableCell>
                  <TableCell>{statoCampagnaBadge(c.stato)}</TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm hover:underline"
                      onClick={() => setDestinatariDi(c)}
                      title="Vedi destinatari"
                    >
                      <Users className="size-4" />
                      {(conteggi?.get(c.id)?.totale ?? 0).toLocaleString("it-IT")}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {c.stato === "in_corso" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => riprendi.mutate(c)}
                        disabled={riprendi.isPending}
                        title="Riprendi invio"
                      >
                        <RotateCw className="size-4 mr-1" /> Riprendi
                      </Button>
                    ) : (
                      c.stato === "pronta" && (conteggi?.get(c.id)?.inCoda ?? 0) > 0 && (
                        <Button size="sm" onClick={() => setAvviando(c)} title="Avvia invio">
                          <Send className="size-4 mr-1" /> Avvia invio
                        </Button>
                      )
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setDestinatariDi(c)} title="Destinatari">
                      <Users className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setEditing(c)}
                      title={c.stato === "in_corso" ? "Invio in corso" : "Modifica"}
                      disabled={c.stato === "in_corso"}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => duplica.mutate(c)}
                      title={c.stato === "in_corso" ? "Invio in corso" : "Duplica"}
                      disabled={c.stato === "in_corso"}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setDeleting(c)}
                      title={c.stato === "in_corso" ? "Invio in corso" : "Elimina"}
                      disabled={c.stato === "in_corso"}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {editing && (
        <EditorCampagnaWhatsApp
          campagna={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["campagne_whatsapp"] })}
        />
      )}

      {destinatariDi && (
        <DestinatariWhatsappDialog
          campagna={destinatariDi}
          onClose={() => setDestinatariDi(null)}
        />
      )}

      {avviando && (
        <ConfermaInvioWhatsappDialog
          campagna={avviando}
          inCoda={conteggi?.get(avviando.id)?.inCoda ?? 0}
          pending={avvia.isPending}
          onConfirm={() => avvia.mutate(avviando)}
          onClose={() => setAvviando(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.nome}» e i suoi destinatari verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={elimina.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={elimina.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) elimina.mutate(deleting); }}
            >
              {elimina.isPending ? "Eliminazione…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfermaInvioWhatsappDialog({
  campagna, inCoda, pending, onConfirm, onClose,
}: {
  campagna: CampagnaWa;
  inCoda: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [testo, setTesto] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Avviare l'invio?</DialogTitle>
          <DialogDescription>
            Campagna «{campagna.nome}»
            {campagna.template_name ? ` — template ${campagna.template_name}` : ""}.
            Riceveranno il messaggio {inCoda.toLocaleString("it-IT")} destinatari.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="conferma-invio-wa">Digita INVIA per confermare</Label>
            <Input
              id="conferma-invio-wa"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder="INVIA"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Verranno inviati messaggi WhatsApp solo ai contatti con consenso esplicito
            (già garantito dai Segmenti).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={onConfirm}
            disabled={testo !== "INVIA" || pending || inCoda === 0}
          >
            {pending ? "Avvio…" : "Invia ora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function indiciVariabili(body: string | null): number[] {
  if (!body) return [];
  const set = new Set<number>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) {
    set.add(parseInt(m[1], 10));
  }
  return [...set].sort((a, b) => a - b);
}

function EditorCampagnaWhatsApp({
  campagna, onClose, onSaved,
}: { campagna: CampagnaWa; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(campagna.nome);
  const [templateId, setTemplateId] = useState<string>(campagna.template_id ?? "");
  const [fissi, setFissi] = useState<Record<string, string>>(
    () => ({ ...(campagna.parametri?.fissi ?? {}) }),
  );

  const { data: templates } = useQuery({
    queryKey: ["whatsapp_template", "opzioni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_template")
        .select("id, nome, stato, body_testo")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateOpt[];
    },
  });

  const scelto = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const variabili = useMemo(() => indiciVariabili(scelto?.body_testo ?? null), [scelto]);
  const variabiliFisse = useMemo(() => variabili.filter((n) => n >= 2), [variabili]);

  const salva = useMutation({
    mutationFn: async (stato: "bozza" | "pronta") => {
      if (!nome.trim()) throw new Error("Il nome campagna è obbligatorio");
      if (stato === "pronta" && (!scelto || scelto.stato !== "approvato")) {
        throw new Error("Scegli un template approvato prima di segnare pronta");
      }
      const fissiPuliti: Record<string, string> = {};
      for (const n of variabiliFisse) {
        const v = (fissi[String(n)] ?? "").trim();
        fissiPuliti[String(n)] = v;
      }
      if (stato === "pronta" && variabiliFisse.some((n) => !fissiPuliti[String(n)])) {
        throw new Error("Compila tutte le variabili del template prima di segnare pronta");
      }
      const { error } = await supabase
        .from("campagne_whatsapp")
        .update({
          nome: nome.trim(),
          template_id: scelto?.id ?? null,
          template_name: scelto?.nome ?? null,
          parametri: { fissi: fissiPuliti },
          stato,
        })
        .eq("id", campagna.id);
      if (error) throw error;
      return stato;
    },
    onSuccess: (stato) => {
      toast.success(stato === "pronta" ? "Campagna segnata come pronta" : "Campagna salvata");
      onSaved();
      if (stato === "pronta") onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore salvataggio"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editor campagna WhatsApp</DialogTitle>
          <DialogDescription>
            Imposta nome e template. Nessun invio viene effettuato da questa schermata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome campagna (interno)</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Invito evento maggio" />
          </div>

          <div className="space-y-2">
            <Label>Template Meta</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli un template" />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {t.nome}
                      <span className="text-xs text-muted-foreground">
                        {t.stato === "approvato" ? "approvato" : t.stato}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scelto && (
              <div className="flex items-center gap-2 text-xs">
                {statoTemplateBadge(scelto.stato)}
                {scelto.stato !== "approvato" && (
                  <span className="text-amber-600">Template non ancora approvato</span>
                )}
              </div>
            )}
          </div>

          {scelto && variabili.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="text-sm font-medium">Contenuto variabili</div>
              <div className="space-y-3">
                {variabili.includes(1) && (
                  <div className="text-sm text-muted-foreground">
                    Variabile 1 — Nome del destinatario (automatico)
                  </div>
                )}
                {variabiliFisse.map((n) => (
                  <div key={n} className="space-y-1">
                    <Label htmlFor={`var-${n}`}>Variabile {n}</Label>
                    <Input
                      id={`var-${n}`}
                      value={fissi[String(n)] ?? ""}
                      onChange={(e) =>
                        setFissi((prev) => ({ ...prev, [String(n)]: e.target.value }))
                      }
                      placeholder={`Valore per {{${n}}}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {scelto?.body_testo && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-medium">Anteprima messaggio</div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {scelto.body_testo}
              </div>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          <Button variant="secondary" onClick={() => salva.mutate("bozza")} disabled={salva.isPending}>
            Salva bozza
          </Button>
          <Button onClick={() => salva.mutate("pronta")} disabled={salva.isPending}>
            Segna come pronta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinatariWhatsappDialog({
  campagna, onClose,
}: { campagna: CampagnaWa; onClose: () => void }) {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [ricercaInput, setRicercaInput] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [confermaMultipla, setConfermaMultipla] = useState(false);
  const inCorso = campagna.stato === "in_corso";

  useEffect(() => {
    const t = setTimeout(() => setRicerca(ricercaInput), 300);
    return () => clearTimeout(t);
  }, [ricercaInput]);

  useEffect(() => { setPagina(1); }, [ricerca]);

  const { data, isLoading } = useQuery({
    queryKey: ["messaggi_whatsapp", campagna.id, pagina, ricerca],
    queryFn: async () => {
      let q = supabase
        .from("messaggi_whatsapp")
        .select("id, numero_dest, nome_riferimento, cliente_id, stato, errore, inviato_at, created_at, clienti(ragione_sociale)", { count: "exact" })
        .eq("campagna_id", campagna.id);
      const term = ricerca.trim().replace(/[,()]/g, " ").trim();
      if (term) q = q.or(`numero_dest.ilike.%${term}%,nome_riferimento.ilike.%${term}%`);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range((pagina - 1) * DEST_PAGE_SIZE, pagina * DEST_PAGE_SIZE - 1);
      if (error) throw error;
      return { righe: (data ?? []) as unknown as MessaggioRiga[], totale: count ?? 0 };
    },
  });

  const righe = data?.righe ?? [];
  const totale = data?.totale ?? 0;
  const totPagine = Math.max(1, Math.ceil(totale / DEST_PAGE_SIZE));
  const da = totale === 0 ? 0 : (pagina - 1) * DEST_PAGE_SIZE + 1;
  const a = Math.min(pagina * DEST_PAGE_SIZE, totale);

  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messaggi_whatsapp").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinatario rimosso");
      qc.invalidateQueries({ queryKey: ["messaggi_whatsapp"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore rimozione destinatario"),
  });

  const rimuoviSelezionati = useMutation({
    mutationFn: async () => {
      for (const part of chunkArray(Array.from(selezionati), 200)) {
        const { error } = await supabase.from("messaggi_whatsapp").delete().in("id", part);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${selezionati.size.toLocaleString("it-IT")} destinatari rimossi`);
      setSelezionati(new Set());
      setConfermaMultipla(false);
      qc.invalidateQueries({ queryKey: ["messaggi_whatsapp"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore rimozione destinatari"),
  });

  const toggleSelezionato = (id: string, checked: boolean) => {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const tuttiSelezionatiInPagina = righe.length > 0 && righe.every((r) => selezionati.has(r.id));
  const togglePagina = (checked: boolean) => {
    setSelezionati((prev) => {
      const next = new Set(prev);
      for (const r of righe) {
        if (checked) next.add(r.id); else next.delete(r.id);
      }
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Destinatari — {campagna.nome}</DialogTitle>
          <DialogDescription>
            Elenco dei numeri aggiunti finora alla campagna. Nessun invio è stato effettuato.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cerca per numero o nome…"
            value={ricercaInput}
            onChange={(e) => setRicercaInput(e.target.value)}
          />
        </div>

        {selezionati.size > 0 && (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm">{selezionati.size.toLocaleString("it-IT")} selezionati</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={inCorso || rimuoviSelezionati.isPending}
              title={inCorso ? "Invio in corso: rimozione non disponibile" : "Rimuovi selezionati"}
              onClick={() => setConfermaMultipla(true)}
            >
              <Trash2 className="size-4 mr-1.5" />
              Rimuovi selezionati
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !righe.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {ricerca
              ? "Nessun destinatario corrisponde alla ricerca."
              : "Nessun destinatario. Aggiungili dalla pagina Segmenti (canale WhatsApp)."}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {totale.toLocaleString("it-IT")} destinatari
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={tuttiSelezionatiInPagina}
                      onCheckedChange={(v) => togglePagina(v === true)}
                      disabled={inCorso}
                      aria-label="Seleziona tutti in pagina"
                    />
                  </TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Inviato il</TableHead>
                  <TableHead>Errore</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selezionati.has(r.id)}
                        onCheckedChange={(v) => toggleSelezionato(r.id, v === true)}
                        disabled={inCorso}
                        aria-label={`Seleziona ${r.numero_dest ?? ""}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.numero_dest || "—"}
                      {r.nome_riferimento && (
                        <div className="text-xs text-muted-foreground">{r.nome_riferimento}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.clienti?.ragione_sociale || "—"}
                    </TableCell>
                    <TableCell>{statoMessaggioBadge(r.stato)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmtDateTime(r.inviato_at)}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[220px] break-words">
                      {r.errore || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={inCorso ? "Invio in corso: rimozione non disponibile" : "Rimuovi dalla campagna"}
                        onClick={() => rimuovi.mutate(r.id)}
                        disabled={rimuovi.isPending || inCorso}
                      >
                        <X className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totale > DEST_PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Mostrati {da.toLocaleString("it-IT")}–{a.toLocaleString("it-IT")} di {totale.toLocaleString("it-IT")}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(1)}>Prima</Button>
                  <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Precedente</Button>
                  <span className="px-2 text-muted-foreground">Pagina {pagina} di {totPagine}</span>
                  <Button variant="outline" size="sm" disabled={pagina >= totPagine} onClick={() => setPagina((p) => p + 1)}>Successiva</Button>
                  <Button variant="outline" size="sm" disabled={pagina >= totPagine} onClick={() => setPagina(totPagine)}>Ultima</Button>
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confermaMultipla} onOpenChange={setConfermaMultipla}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere {selezionati.size.toLocaleString("it-IT")} destinatari dalla campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              I numeri selezionati saranno eliminati dall'elenco destinatari. L'operazione non è annullabile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rimuoviSelezionati.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={rimuoviSelezionati.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); rimuoviSelezionati.mutate(); }}
            >
              {rimuoviSelezionati.isPending ? "Rimozione…" : "Rimuovi definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
