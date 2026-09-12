// Tab WhatsApp della pagina Campagne: lista template Meta + editor con anteprima bolla.
// Nessuna chiamata alle API Meta in questo strato: "Invia in approvazione" setta solo lo stato.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Copy, Save, Send, Bold, Italic, Smile, Braces, ImagePlus, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inviaTemplateInApprovazione } from "@/lib/whatsapp-template.functions";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type WaTemplate = {
  id: string;
  nome: string;
  categoria: string;
  lingua: string;
  stato: string;
  nota_rifiuto: string | null;
  header_tipo: string;
  header_testo: string | null;
  header_media_url: string | null;
  body_testo: string;
  footer_testo: string | null;
  pulsanti: unknown;
  updated_at: string;
};

export type PulsanteWa =
  | { tipo: "link"; testo: string; url: string }
  | { tipo: "rapido"; testo: string; flusso: FlussoRapido; evento_id?: string | null };

type FlussoRapido = "disiscrizione" | "evento" | "promozione" | "generico";

const FLUSSI: { value: FlussoRapido; label: string }[] = [
  { value: "disiscrizione", label: "Disiscrizione" },
  { value: "evento", label: "Adesione evento" },
  { value: "promozione", label: "Adesione promozione" },
  { value: "generico", label: "Generico" },
];

const EMOJI = ["🟢", "✅", "📅", "📍", "🎉", "👉", "⭐", "🔔", "🛒", "%"];

const BODY_DEFAULT =
  "Gentile cliente,\n\n\n\nPer non ricevere più messaggi rispondi STOP";

function statoWaBadge(s: string) {
  switch (s) {
    case "in_attesa":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">In attesa</Badge>;
    case "approvato":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Approvato</Badge>;
    case "rifiutato":
      return <Badge variant="destructive">Rifiutato</Badge>;
    default:
      return <Badge variant="secondary">Bozza</Badge>;
  }
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("it-IT"); } catch { return s; }
}

function leggiPulsanti(v: unknown): PulsanteWa[] {
  if (!Array.isArray(v)) return [];
  return (v as PulsanteWa[]).filter((p) => p && (p.tipo === "link" || p.tipo === "rapido"));
}

export function WhatsAppTemplateTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [deleting, setDeleting] = useState<WaTemplate | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp_template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_template")
        .select("id, nome, categoria, lingua, stato, nota_rifiuto, meta_template_id, meta_template_name, header_tipo, header_testo, header_media_url, body_testo, footer_testo, pulsanti, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WaTemplate[];
    },
  });

  const invalida = () => qc.invalidateQueries({ queryKey: ["whatsapp_template"] });

  const crea = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_template")
        .insert({
          nome: "Nuovo template",
          categoria: "marketing",
          stato: "bozza",
          header_tipo: "nessuno",
          body_testo: BODY_DEFAULT,
          pulsanti: [],
          created_by: user?.id ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as WaTemplate;
    },
    onSuccess: (t) => { invalida(); setEditing(t); },
    onError: (e: any) => toast.error(e?.message ?? "Errore creazione template"),
  });

  const duplica = useMutation({
    mutationFn: async (t: WaTemplate) => {
      const { error } = await supabase.from("whatsapp_template").insert({
        nome: `${t.nome} (copia)`,
        categoria: t.categoria,
        lingua: t.lingua,
        stato: "bozza",
        header_tipo: t.header_tipo,
        header_testo: t.header_testo,
        header_media_url: t.header_media_url,
        body_testo: t.body_testo,
        footer_testo: t.footer_testo,
        pulsanti: (t.pulsanti ?? []) as never,
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template duplicato"); invalida(); },
    onError: (e: any) => toast.error(e?.message ?? "Errore duplicazione"),
  });

  const elimina = useMutation({
    mutationFn: async (t: WaTemplate) => {
      const { error } = await supabase.from("whatsapp_template").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template eliminato"); setDeleting(null); invalida(); },
    onError: (e: any) => toast.error(e?.message ?? "Errore eliminazione"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Template WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Componi i template da mandare in approvazione. L'invio dei messaggi arriverà nel prossimo passaggio.
          </p>
        </div>
        <Button onClick={() => crea.mutate()} disabled={crea.isPending}>
          <Plus className="size-4 mr-2" /> Nuovo template
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !templates?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nessun template salvato.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Aggiornato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{t.categoria}</Badge>
                  </TableCell>
                  <TableCell>
                    {statoWaBadge(t.stato)}
                    {t.stato === "rifiutato" && t.nota_rifiuto && (
                      <div className="text-xs text-destructive mt-1 max-w-[260px]">{t.nota_rifiuto}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(t.updated_at)}</TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)} title="Modifica">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => duplica.mutate(t)} title="Duplica">
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(t)} title="Elimina">
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
        <EditorTemplateWhatsApp
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={invalida}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il template?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.nome}» verrà eliminato definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && elimina.mutate(deleting)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditorTemplateWhatsApp({
  template, onClose, onSaved,
}: { template: WaTemplate; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(template.nome);
  const [categoria, setCategoria] = useState(template.categoria || "marketing");
  const [headerTipo, setHeaderTipo] = useState(template.header_tipo || "nessuno");
  const [headerTesto, setHeaderTesto] = useState(template.header_testo ?? "");
  const [headerMedia, setHeaderMedia] = useState(template.header_media_url ?? "");
  const [body, setBody] = useState(template.body_testo ?? "");
  const [footer, setFooter] = useState(template.footer_testo ?? "");
  const [pulsanti, setPulsanti] = useState<PulsanteWa[]>(leggiPulsanti(template.pulsanti));
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: eventi } = useQuery({
    queryKey: ["eventi", "select-template-wa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi")
        .select("id, nome, data_evento")
        .order("data_evento", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Inserisce testo al cursore, oppure avvolge la selezione. */
  function applica(pre: string, post = pre, soloInserimento = false) {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + pre); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const sel = body.slice(start, end);
    const nuovo = soloInserimento
      ? body.slice(0, start) + pre + body.slice(end)
      : body.slice(0, start) + pre + sel + post + body.slice(end);
    setBody(nuovo);
    const caret = soloInserimento ? start + pre.length : start + pre.length + sel.length + post.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function inserisciCampo() {
    const usati = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const prossimo = usati.length ? Math.max(...usati) + 1 : 1;
    applica(`{{${prossimo}}}`, "", true);
  }

  async function caricaImmagine(file: File) {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `whatsapp-template/${template.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("email-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Caricamento immagine fallito: ${error.message}`);
      setHeaderMedia(`/api/public/email-img/${path}`);
      toast.success("Immagine caricata");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore caricamento");
    } finally {
      setUploading(false);
    }
  }

  function aggiungiPulsante() {
    if (pulsanti.length >= 3) {
      toast.warning("Massimo 3 pulsanti per template");
      return;
    }
    setPulsanti([...pulsanti, { tipo: "link", testo: "", url: "" }]);
  }

  function aggiornaPulsante(i: number, patch: Partial<PulsanteWa>) {
    setPulsanti(pulsanti.map((p, idx) => (idx === i ? ({ ...p, ...patch } as PulsanteWa) : p)));
  }

  /** Salva i campi correnti; se `stato` è omesso non tocca lo stato del template. */
  async function salvaCampi(stato?: "bozza") {
    if (!nome.trim()) throw new Error("Il nome template è obbligatorio");
    if (!body.trim()) throw new Error("Il corpo del messaggio è obbligatorio");
    const { error } = await supabase
      .from("whatsapp_template")
      .update({
        nome: nome.trim(),
        categoria,
        ...(stato ? { stato } : {}),
        header_tipo: headerTipo,
        header_testo: headerTipo === "testo" ? headerTesto.trim() || null : null,
        header_media_url: headerTipo === "immagine" ? headerMedia || null : null,
        body_testo: body,
        footer_testo: footer.trim() || null,
        pulsanti: pulsanti as never,
      } as never)
      .eq("id", template.id);
    if (error) throw error;
  }

  const salva = useMutation({
    mutationFn: async () => salvaCampi("bozza"),
    onSuccess: () => {
      toast.success("Template salvato");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore salvataggio"),
  });

  const invia = useMutation({
    mutationFn: async () => {
      await salvaCampi();
      return await inviaTemplateInApprovazione({ data: { templateId: template.id } });
    },
    onSuccess: (res) => {
      onSaved();
      if (res?.ok) {
        toast.success("Template inviato in approvazione a Meta");
        onClose();
      } else {
        toast.error(res?.error ?? "Invio a Meta non riuscito");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore invio a Meta"),
  });


  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Template WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* COMPOSIZIONE */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome template (interno)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Intestazione</Label>
              <Select value={headerTipo} onValueChange={setHeaderTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuna</SelectItem>
                  <SelectItem value="immagine">Immagine</SelectItem>
                  <SelectItem value="testo">Testo</SelectItem>
                </SelectContent>
              </Select>
              {headerTipo === "testo" && (
                <Input
                  className="mt-2"
                  placeholder="Testo dell'intestazione"
                  value={headerTesto}
                  onChange={(e) => setHeaderTesto(e.target.value)}
                />
              )}
              {headerTipo === "immagine" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void caricaImmagine(f);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={uploading}
                    onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="size-4 mr-1.5" />
                    {uploading ? "Caricamento…" : headerMedia ? "Sostituisci immagine" : "Carica immagine"}
                  </Button>
                  {headerMedia && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setHeaderMedia("")}>
                      <X className="size-4 mr-1" /> Rimuovi
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Messaggio</Label>
              <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
                <Button type="button" variant="ghost" size="sm" title="Grassetto"
                  onClick={() => applica("*")}>
                  <Bold className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" title="Corsivo"
                  onClick={() => applica("_")}>
                  <Italic className="size-4" />
                </Button>
                <span className="mx-1 h-5 w-px bg-border" />
                <Smile className="size-4 text-muted-foreground mx-1" />
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded px-1.5 py-0.5 text-base hover:bg-accent"
                    onClick={() => applica(e, "", true)}
                  >
                    {e}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                <Button type="button" variant="ghost" size="sm" onClick={inserisciCampo}>
                  <Braces className="size-4 mr-1" /> Inserisci campo
                </Button>
              </div>
              <Textarea
                ref={bodyRef}
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Piè di pagina (opzionale)</Label>
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pulsanti</Label>
                <Button type="button" variant="outline" size="sm" onClick={aggiungiPulsante}>
                  <Plus className="size-4 mr-1" /> Aggiungi pulsante
                </Button>
              </div>

              {pulsanti.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessun pulsante. Massimo 3.</p>
              )}

              {pulsanti.map((p, i) => (
                <Card key={i} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={p.tipo}
                      onValueChange={(v) =>
                        setPulsanti(pulsanti.map((x, idx) =>
                          idx === i
                            ? v === "link"
                              ? { tipo: "link", testo: x.testo, url: "" }
                              : { tipo: "rapido", testo: x.testo, flusso: "generico" }
                            : x,
                        ))
                      }
                    >
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="link">Link (URL)</SelectItem>
                        <SelectItem value="rapido">Risposta rapida</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex-1" />
                    <Button type="button" variant="ghost" size="icon"
                      onClick={() => setPulsanti(pulsanti.filter((_, idx) => idx !== i))}
                      title="Rimuovi pulsante">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>

                  {p.tipo === "link" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Testo pulsante"
                        value={p.testo}
                        onChange={(e) => aggiornaPulsante(i, { testo: e.target.value })}
                      />
                      <Input
                        placeholder="https://…"
                        value={p.url}
                        onChange={(e) => aggiornaPulsante(i, { url: e.target.value } as Partial<PulsanteWa>)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select
                          value={p.flusso}
                          onValueChange={(v) =>
                            aggiornaPulsante(i, { flusso: v as FlussoRapido, evento_id: null } as Partial<PulsanteWa>)
                          }
                        >
                          <SelectTrigger><SelectValue placeholder="Flusso" /></SelectTrigger>
                          <SelectContent>
                            {FLUSSI.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Testo pulsante"
                          value={p.testo}
                          onChange={(e) => aggiornaPulsante(i, { testo: e.target.value })}
                        />
                      </div>

                      {p.flusso === "evento" && (
                        <Select
                          value={p.evento_id ?? ""}
                          onValueChange={(v) => aggiornaPulsante(i, { evento_id: v } as Partial<PulsanteWa>)}
                        >
                          <SelectTrigger><SelectValue placeholder="Scegli l'evento" /></SelectTrigger>
                          <SelectContent>
                            {(eventi ?? []).map((ev: any) => (
                              <SelectItem key={ev.id} value={ev.id}>
                                {ev.nome}{ev.data_evento ? ` — ${fmtDate(ev.data_evento)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {p.flusso === "promozione" && (
                        <Select disabled value="">
                          <SelectTrigger>
                            <SelectValue placeholder="Modulo iniziative in arrivo" />
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* ANTEPRIMA */}
          <div className="space-y-2">
            <Label>Anteprima</Label>
            <AnteprimaBolla
              headerTipo={headerTipo}
              headerTesto={headerTesto}
              headerMedia={headerMedia}
              body={body}
              footer={footer}
              pulsanti={pulsanti}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          <Button variant="secondary" onClick={() => salva.mutate()} disabled={salva.isPending || invia.isPending}>
            <Save className="size-4 mr-1.5" /> Salva bozza
          </Button>
          <Button onClick={() => invia.mutate()} disabled={salva.isPending || invia.isPending}>
            <Send className="size-4 mr-1.5" /> Invia in approvazione
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rende *grassetto*, _corsivo_ e i segnaposto {{n}} come chip evidenziati. */
function renderRiga(riga: string, key: number) {
  const parti = riga.split(/(\*[^*\n]+\*|_[^_\n]+_|\{\{\d+\}\})/g).filter(Boolean);
  return (
    <p key={key} className="min-h-[1em]">
      {parti.map((p, i) => {
        if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        const campo = p.match(/^\{\{(\d+)\}\}$/);
        if (campo) {
          return (
            <span key={i} className="rounded bg-amber-200/70 px-1 text-amber-900">
              [Campo {campo[1]}]
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

function AnteprimaBolla({
  headerTipo, headerTesto, headerMedia, body, footer, pulsanti,
}: {
  headerTipo: string;
  headerTesto: string;
  headerMedia: string;
  body: string;
  footer: string;
  pulsanti: PulsanteWa[];
}) {
  const righe = useMemo(() => body.split("\n"), [body]);

  return (
    <div className="rounded-lg bg-[#ece5dd] p-4 min-h-[320px]">
      <div className="max-w-[330px] rounded-lg bg-white shadow-sm overflow-hidden">
        {headerTipo === "immagine" && headerMedia && (
          <img src={headerMedia} alt="Intestazione" className="w-full object-cover max-h-44" />
        )}
        <div className="p-3 space-y-1 text-sm text-slate-800">
          {headerTipo === "testo" && headerTesto && (
            <p className="font-semibold">{headerTesto}</p>
          )}
          <div className="whitespace-pre-wrap break-words">
            {righe.map((r, i) => renderRiga(r, i))}
          </div>
          {footer && <p className="pt-1 text-xs text-slate-500">{footer}</p>}
          <p className="text-right text-[10px] text-slate-400">
            {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {pulsanti.length > 0 && (
          <div className="border-t">
            {pulsanti.map((p, i) => (
              <div
                key={i}
                className="border-b last:border-b-0 py-2 text-center text-sm font-medium text-[#00a5f4]"
              >
                {p.testo || "Pulsante"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
