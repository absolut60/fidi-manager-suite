import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Pencil, Trash2, Copy, Save, CheckCircle2, Users, X, Send, StopCircle, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor, pulisciHtmlEmail, inserisciTestoNellEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
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
import { AllegatiSection } from "@/components/allegati-section";
import {
  buildEmailCampagna, DATI_ESEMPIO, PLACEHOLDER_MARKETING,
} from "@/lib/campagna-marketing-email";
import {
  avviaInvioCampagnaMarketing, annullaInvioCampagnaMarketing, inviaEmailProvaCampagna,
} from "@/lib/campagna-marketing.functions";

export const Route = createFileRoute("/_app/marketing/campagne")({
  component: MarketingCampagnePage,
});

import { MARKETING_ROLES } from "@/lib/ruoli-marketing";

type Campagna = {
  id: string;
  nome: string;
  oggetto: string;
  corpo_html: string;
  stato: string;
  created_at: string;
  updated_at: string;
  inviati: number;
  falliti: number;
  saltati: number;
  inviata_at: string | null;
  note: string | null;
  mittente_nome: string | null;
  mittente_email: string | null;
};

type ConteggiCampagna = {
  totale: number;
  da_inviare: number;
  inviato: number;
  fallito: number;
  saltato: number;
};

function statoBadge(stato: string) {
  switch (stato) {
    case "pronta":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pronta</Badge>;
    case "in_corso":
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Invio in corso</Badge>;
    case "completata":
      return <Badge className="bg-sky-600 text-white hover:bg-sky-600">Completata</Badge>;
    case "completata_con_errori":
      return <Badge variant="destructive">Completata con errori</Badge>;
    case "annullata":
      return <Badge variant="outline">Annullata</Badge>;
    default:
      return <Badge variant="secondary">Bozza</Badge>;
  }
}

function statoInvioBadge(s: string) {
  switch (s) {
    case "inviato":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Inviato</Badge>;
    case "fallito":
      return <Badge variant="destructive">Fallito</Badge>;
    case "email_non_valida":
      return <Badge variant="destructive">Email non valida</Badge>;
    case "saltato":
      return <Badge variant="outline">Saltato</Badge>;
    default:
      return <Badge variant="secondary">Da inviare</Badge>;
  }
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("it-IT"); } catch { return s; }
}

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("it-IT"); } catch { return s; }
}

/** Anteprima: stessa pipeline dell'invio reale (con footer di recesso). */
function buildAnteprima(oggetto: string, corpo: string, mittenteNome?: string): { oggetto: string; html: string } {
  return buildEmailCampagna({
    oggetto,
    corpo,
    dati: DATI_ESEMPIO,
    sede: null,
    mittente: { nome: mittenteNome || "Ufficio Marketing MADE" },
    linkRecesso: "#",
    useCid: false,
    // In anteprima le immagini vengono risolte sull'origin corrente.
    baseUrl: typeof window !== "undefined" ? window.location.origin : null,
  });
}


function MarketingCampagnePage() {
  const { roles, user, loading } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Campagna | null>(null);
  const [deleting, setDeleting] = useState<Campagna | null>(null);
  const [destinatariDi, setDestinatariDi] = useState<Campagna | null>(null);
  const [inviando, setInviando] = useState<Campagna | null>(null);
  const [provaDi, setProvaDi] = useState<Campagna | null>(null);

  const canSee = useMemo(() => (roles as string[]).some((r) => MARKETING_ROLES.has(r)), [roles]);

  const { data: campagne, isLoading } = useQuery({
    queryKey: ["campagne_email_marketing"],
    enabled: canSee,
    refetchInterval: (q) => {
      const d = q.state.data as Campagna[] | undefined;
      return d?.some((c) => c.stato === "in_corso") ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .select("id, nome, oggetto, corpo_html, stato, created_at, updated_at, inviati, falliti, saltati, inviata_at, note, mittente_nome, mittente_email")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campagna[];
    },
  });

  const inCorso = !!campagne?.some((c) => c.stato === "in_corso");

  const { data: conteggi } = useQuery({
    queryKey: ["campagne-email-destinatari", "conteggi"],
    enabled: canSee,
    refetchInterval: inCorso ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_destinatari")
        .select("campagna_id, stato_invio");
      if (error) throw error;
      const map = new Map<string, ConteggiCampagna>();
      for (const r of (data ?? []) as Array<{ campagna_id: string; stato_invio: string }>) {
        const cur = map.get(r.campagna_id) ?? { totale: 0, da_inviare: 0, inviato: 0, fallito: 0, saltato: 0 };
        cur.totale += 1;
        if (r.stato_invio === "inviato") cur.inviato += 1;
        else if (r.stato_invio === "fallito") cur.fallito += 1;
        else if (r.stato_invio === "da_inviare") cur.da_inviare += 1;
        else cur.saltato += 1;
        map.set(r.campagna_id, cur);
      }
      return map;
    },
  });

  const annulla = useMutation({
    mutationFn: async (c: Campagna) => annullaInvioCampagnaMarketing({ data: { campagnaId: c.id } }),
    onSuccess: () => {
      toast.success("Invio annullato: il job si fermerà a breve");
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore annullamento"),
  });


  const crea = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .insert({
          nome: "Nuova campagna",
          oggetto: "",
          corpo_html: "<p>Gentile {{ragione_sociale}},</p>\n<p></p>",
          stato: "bozza",
          created_by: user?.id ?? null,
        })
        .select("id, nome, oggetto, corpo_html, stato, created_at, updated_at")
        .single();
      if (error) throw error;
      return data as Campagna;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
      setEditing(c);
    },
    onError: (e: any) => toast.error(e.message ?? "Errore creazione campagna"),
  });

  const duplica = useMutation({
    mutationFn: async (c: Campagna) => {
      const { error } = await supabase.from("campagne_email_marketing").insert({
        nome: `${c.nome} (copia)`,
        oggetto: c.oggetto,
        corpo_html: c.corpo_html,
        stato: "bozza",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna duplicata");
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Errore duplicazione"),
  });

  const elimina = useMutation({
    mutationFn: async (c: Campagna) => {
      const { error } = await supabase.from("campagne_email_marketing").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna eliminata");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Errore eliminazione"),
  });

  if (loading) return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  if (!canSee)
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
        </p>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mail className="size-6" /> Campagne email
          </h1>
          <p className="text-sm text-muted-foreground">
            Componi, prova e invia le email di campagna ai destinatari raccolti dai segmenti.
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
            Nessuna campagna salvata.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-center">Destinatari</TableHead>
                <TableHead>Avanzamento</TableHead>
                <TableHead>Aggiornata</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campagne.map((c) => {
                const k = conteggi?.get(c.id);
                const daInviare = k?.da_inviare ?? 0;
                const totale = k?.totale ?? 0;
                return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.oggetto || "—"}</TableCell>
                  <TableCell>
                    {statoBadge(c.stato)}
                    {c.note && (
                      <div className="text-xs text-destructive mt-1 max-w-[220px]">{c.note}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm hover:underline"
                      onClick={() => setDestinatariDi(c)}
                      title="Vedi destinatari"
                    >
                      <Users className="size-4" />
                      {totale.toLocaleString("it-IT")}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {c.stato === "in_corso" ? (
                      <span className="font-medium text-amber-600">
                        {(k?.inviato ?? 0).toLocaleString("it-IT")} / {totale.toLocaleString("it-IT")} inviate…
                      </span>
                    ) : (
                      <>
                        Da inviare {daInviare} · Inviate {k?.inviato ?? 0} · Fallite {k?.fallito ?? 0} · Saltate {k?.saltato ?? 0}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {c.stato === "in_corso" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => annulla.mutate(c)}
                        disabled={annulla.isPending}
                        title="Annulla invio"
                      >
                        <StopCircle className="size-4 mr-1" /> Annulla invio
                      </Button>
                    ) : daInviare > 0 ? (
                      <Button size="sm" onClick={() => setInviando(c)} title="Invia campagna">
                        <Send className="size-4 mr-1" /> Invia campagna
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="icon" onClick={() => setProvaDi(c)} title="Invia email di prova">
                      <FlaskConical className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDestinatariDi(c)} title="Destinatari">
                      <Users className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Modifica">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => duplica.mutate(c)} title="Duplica">
                      <Copy className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} title="Elimina">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>

                </TableRow>
                );
              })}

            </TableBody>
          </Table>
        )}
      </Card>

      {editing && (
        <EditorCampagna
          campagna={editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] })}
        />
      )}

      {destinatariDi && (
        <DestinatariCampagnaDialog
          campagna={destinatariDi}
          onClose={() => setDestinatariDi(null)}
        />
      )}

      {inviando && (
        <ConfermaInvioDialog
          campagna={inviando}
          daInviare={conteggi?.get(inviando.id)?.da_inviare ?? 0}
          onClose={() => setInviando(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["campagne_email_marketing"] });
            qc.invalidateQueries({ queryKey: ["campagne-email-destinatari"] });
          }}
        />
      )}

      {provaDi && (
        <InviaProvaDialog
          campagna={provaDi}
          emailDefault={user?.email ?? ""}
          onClose={() => setProvaDi(null)}
        />
      )}


      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.nome}» verrà eliminata definitivamente.
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

function EditorCampagna({
  campagna, onClose, onSaved,
}: { campagna: Campagna; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(campagna.nome);
  const [oggetto, setOggetto] = useState(campagna.oggetto);
  const [corpo, setCorpo] = useState(campagna.corpo_html);
  const [mittNome, setMittNome] = useState(campagna.mittente_nome ?? "");
  const [mittEmail, setMittEmail] = useState(campagna.mittente_email ?? "");
  const [modoHtml, setModoHtml] = useState(false);
  // Valori salvati: servono a capire se ci sono modifiche pendenti.
  const [salvato, setSalvato] = useState({
    nome: campagna.nome, oggetto: campagna.oggetto, corpo: campagna.corpo_html,
    mittente_nome: campagna.mittente_nome ?? "", mittente_email: campagna.mittente_email ?? "",
  });
  const [confermaChiusura, setConfermaChiusura] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const uploadImmagine = async (file: File) => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `campagne/${campagna.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("email-assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Caricamento immagine fallito: ${error.message}`);
    // URL RELATIVO: viene reso assoluto solo al momento dell'anteprima
    // (origin corrente) o dell'invio (dominio pubblico dell'app).
    return `/api/public/email-img/${path}`;
  };

  const anteprima = useMemo(() => buildAnteprima(oggetto, corpo, mittNome), [oggetto, corpo, mittNome]);

  const salva = useMutation({
    mutationFn: async (stato: "bozza" | "pronta") => {
      if (!nome.trim()) throw new Error("Il nome campagna è obbligatorio");
      if (!oggetto.trim()) throw new Error("L'oggetto è obbligatorio");
      const { error } = await supabase
        .from("campagne_email_marketing")
        .update({
          nome: nome.trim(), oggetto: oggetto.trim(), corpo_html: pulisciHtmlEmail(corpo), stato,
          mittente_nome: mittNome.trim() || null, mittente_email: mittEmail.trim() || null,
        })
        .eq("id", campagna.id);
      if (error) throw error;
      return stato;
    },
    onSuccess: (stato) => {
      toast.success(stato === "pronta" ? "Campagna segnata come pronta" : "Campagna salvata");
      setSalvato({
        nome: nome.trim(), oggetto: oggetto.trim(), corpo,
        mittente_nome: mittNome.trim(), mittente_email: mittEmail.trim(),
      });
      onSaved();
      if (stato === "pronta") onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Errore salvataggio"),
  });

  const modifichePendenti =
    nome.trim() !== salvato.nome.trim() ||
    oggetto.trim() !== salvato.oggetto.trim() ||
    corpo !== salvato.corpo ||
    mittNome.trim() !== salvato.mittente_nome.trim() ||
    mittEmail.trim() !== salvato.mittente_email.trim();

  /** La chiusura passa sempre da qui: con modifiche pendenti chiede conferma. */
  const tentaChiusura = () => {
    if (modifichePendenti) { setConfermaChiusura(true); return; }
    onClose();
  };

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    if (!modoHtml) {
      if (inserisciTestoNellEditor(editorRef.current, token)) return;
      // Nessun cursore attivo nell'editor: aggiungi in coda come paragrafo.
      setCorpo((c) => `${c}${token}`);
      return;
    }
    const el = corpoRef.current;
    if (!el) { setCorpo((c) => c + token); return; }
    const start = el.selectionStart ?? corpo.length;
    const end = el.selectionEnd ?? corpo.length;
    const next = corpo.slice(0, start) + token + corpo.slice(end);
    setCorpo(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) tentaChiusura(); }}>
      <DialogContent
        className="max-w-6xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Editor campagna email</DialogTitle>
          <DialogDescription>
            Componi il messaggio e controlla l'anteprima. Nessun invio viene effettuato da questa schermata.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome campagna (interno)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Promo primavera 2026" />
            </div>
            <div className="space-y-2">
              <Label>Oggetto email</Label>
              <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} placeholder="Oggetto visibile al cliente" />
            </div>

            <Card className="p-4 space-y-3">
              <div className="text-sm font-medium">Mittente (opzionale)</div>
              <div className="space-y-2">
                <Label>Nome mittente</Label>
                <Input
                  value={mittNome}
                  onChange={(e) => setMittNome(e.target.value)}
                  placeholder="Es. Ufficio Marketing MADE"
                />
              </div>
              <div className="space-y-2">
                <Label>Email per le risposte (Reply-To)</Label>
                <Input
                  value={mittEmail}
                  onChange={(e) => setMittEmail(e.target.value)}
                  placeholder="Es. marketing@madepoint.it"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se lasci vuoto, viene usato nome ed email di chi invia. L'indirizzo mittente visibile resta quello aziendale.
              </p>
            </Card>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Corpo email</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={modoHtml} onCheckedChange={setModoHtml} />
                  Modifica HTML
                </label>
              </div>
              {modoHtml ? (
                <Textarea
                  ref={corpoRef}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={16}
                  className="font-mono text-xs"
                />
              ) : (
                <>
                  <RichTextEditor
                    value={corpo}
                    onChange={setCorpo}
                    onUploadImage={uploadImmagine}
                    editorRef={editorRef}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Puoi inserire immagini dalla barra strumenti, trascinandole nell'editor o incollandole (Ctrl+V).
                  </p>
                </>
              )}
            </div>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-medium">Placeholder disponibili</div>
              <div className="space-y-1">
                {PLACEHOLDER_MARKETING.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <button
                        type="button"
                        className="font-mono text-primary hover:underline"
                        onClick={() => insertPlaceholder(p.key)}
                      >
                        {`{{${p.key}}}`}
                      </button>
                      <span className="text-muted-foreground"> — {p.descr}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">es. {p.esempio}</span>
                  </div>
                ))}
              </div>
            </Card>

            <AllegatiSection
              entitaTipo="campagna_email"
              entitaId={campagna.id}
              title="Allegati campagna (PDF, volantini)"
              compact
            />
          </div>

          <div className="space-y-2">
            <Label>Anteprima</Label>
            <div className="text-xs text-muted-foreground">
              Oggetto: <span className="font-medium text-foreground">{anteprima.oggetto || "—"}</span>
            </div>
            <iframe
              title="Anteprima campagna"
              srcDoc={anteprima.html}
              className="w-full h-[560px] rounded-md border bg-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={tentaChiusura}>Chiudi</Button>
          <Button variant="secondary" onClick={() => salva.mutate("bozza")} disabled={salva.isPending}>
            <Save className="size-4 mr-2" /> Salva bozza
          </Button>
          <Button onClick={() => salva.mutate("pronta")} disabled={salva.isPending}>
            <CheckCircle2 className="size-4 mr-2" /> Segna come pronta
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confermaChiusura} onOpenChange={setConfermaChiusura}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Ci sono modifiche non salvate. Chiudere senza salvare?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfermaChiusura(false); onClose(); }}>
              Chiudi senza salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

type DestinatarioRiga = {
  id: string;
  email: string;
  tipo_destinatario: string;
  nome_riferimento: string | null;
  cliente_id: string | null;
  aggiunto_il: string;
  stato_invio: string;
  inviato_at: string | null;
  errore: string | null;
  clienti: { ragione_sociale: string } | null;
};

function DestinatariCampagnaDialog({
  campagna, onClose,
}: { campagna: Campagna; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: righe, isLoading } = useQuery({
    queryKey: ["campagne-email-destinatari", campagna.id],
    refetchInterval: campagna.stato === "in_corso" ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_destinatari")
        .select("id, email, tipo_destinatario, nome_riferimento, cliente_id, aggiunto_il, stato_invio, inviato_at, errore, clienti(ragione_sociale)")
        .eq("campagna_id", campagna.id)
        .order("aggiunto_il", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DestinatarioRiga[];
    },
  });


  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campagne_email_destinatari").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinatario rimosso");
      qc.invalidateQueries({ queryKey: ["campagne-email-destinatari"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore rimozione destinatario"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Destinatari — {campagna.nome}</DialogTitle>
          <DialogDescription>
            Elenco degli indirizzi aggiunti finora alla campagna. Nessun invio è stato effettuato.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !righe?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nessun destinatario. Aggiungili dalla pagina Segmenti.
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {righe.length.toLocaleString("it-IT")} destinatari
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Stato invio</TableHead>
                  <TableHead>Inviata il</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Errore</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.email}
                      {r.nome_riferimento && (
                        <div className="text-xs text-muted-foreground">{r.nome_riferimento}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.tipo_destinatario === "aziendale" ? "secondary" : "outline"}>
                        {r.tipo_destinatario === "aziendale" ? "Aziendale" : "Contatto"}
                      </Badge>
                    </TableCell>
                    <TableCell>{statoInvioBadge(r.stato_invio)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmtDateTime(r.inviato_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.clienti?.ragione_sociale || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[220px] break-words">
                      {r.errore || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Rimuovi dalla campagna"
                        onClick={() => rimuovi.mutate(r.id)}
                        disabled={rimuovi.isPending}
                      >
                        <X className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Conferma esplicita dell'invio: richiede di digitare INVIA. */
function ConfermaInvioDialog({
  campagna, daInviare, onClose, onDone,
}: { campagna: Campagna; daInviare: number; onClose: () => void; onDone: () => void }) {
  const [conferma, setConferma] = useState("");

  const avvia = useMutation({
    mutationFn: async () => avviaInvioCampagnaMarketing({ data: { campagnaId: campagna.id } }),
    onSuccess: (r: any) => {
      toast.success(`Invio avviato per ${r?.totale ?? daInviare} destinatari`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore avvio invio"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confermi l'invio della campagna?</DialogTitle>
          <DialogDescription>
            L'invio è definitivo e parte immediatamente in background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Campagna:</span> <strong>{campagna.nome}</strong></div>
          <div><span className="text-muted-foreground">Oggetto:</span> {campagna.oggetto || "—"}</div>
          <div className="text-base">
            Riceveranno l'email <strong>{daInviare.toLocaleString("it-IT")}</strong> destinatari.
          </div>
        </div>

        <div className="space-y-2">
          <Label>Digita <span className="font-mono font-semibold">INVIA</span> per confermare</Label>
          <Input value={conferma} onChange={(e) => setConferma(e.target.value)} placeholder="INVIA" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => avvia.mutate()}
            disabled={conferma.trim().toUpperCase() !== "INVIA" || avvia.isPending || daInviare === 0}
          >
            <Send className="size-4 mr-2" /> Invia ora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Invio di prova a un singolo indirizzo: nessuna scrittura di stato. */
function InviaProvaDialog({
  campagna, emailDefault, onClose,
}: { campagna: Campagna; emailDefault: string; onClose: () => void }) {
  const [dest, setDest] = useState(emailDefault);

  const prova = useMutation({
    mutationFn: async () =>
      inviaEmailProvaCampagna({ data: { campagnaId: campagna.id, destinatario: dest.trim() } }),
    onSuccess: () => {
      toast.success(`Email di prova inviata a ${dest.trim()}`);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore invio di prova"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invia email di prova</DialogTitle>
          <DialogDescription>
            Stessa composizione dell'invio reale (allegati e footer di recesso inclusi), con dati di
            esempio. Non modifica la campagna né i destinatari.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Indirizzo destinatario</Label>
          <Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="nome@azienda.it" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => prova.mutate()} disabled={!dest.trim() || prova.isPending}>
            <FlaskConical className="size-4 mr-2" /> Invia prova
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

