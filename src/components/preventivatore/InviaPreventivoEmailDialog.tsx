// Fetta 2: finestra "Invia per email" del preventivo (stile dell'email libera del recupero).
// Invio solo tramite inviaPreventivoPerEmail; nessun tracciamento né cambio stato qui (fetta 3).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoCopie, type DestinatarioCopia } from "@/components/email-recupero/campo-copie";
import { isEmailValida } from "@/lib/email-validazione";
import { renderTemplate } from "@/lib/template-email-render";
import type { TemplateEmail } from "@/lib/template-email";
import { destinatarioPropostoPreventivo, htmlInTestoSemplice, MAX_INDIRIZZI_PREVENTIVO, TIPO_TEMPLATE_INVIO_PREVENTIVO } from "@/lib/invio-preventivo-email-core";
import { inviaPreventivoPerEmail } from "@/lib/invio-preventivo-email";
import { nomeIntestatarioPdf } from "@/lib/soggetto-preventivo";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";

function Sezione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return <section className="space-y-2 min-w-0"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titolo}</h3>{children}</section>;
}
const pesoFile = (b: number) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

export function InviaPreventivoEmailDialog({ open, onOpenChange, prev, blob, fileName }: {
  open: boolean; onOpenChange: (v: boolean) => void; prev: PreventivoConDettagli; blob: Blob | null; fileName: string;
}) {
  const { profilo } = useAuth();
  const qc = useQueryClient();
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";
  const [to, setTo] = useState("");
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [sending, setSending] = useState(false);
  const [iniziato, setIniziato] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ["template-email-invio-preventivo"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("template_email").select("id, nome, oggetto, corpo, tipo, attivo").eq("tipo", TIPO_TEMPLATE_INVIO_PREVENTIVO).eq("attivo", true).order("nome");
      if (error) throw error;
      return data as TemplateEmail[];
    },
  });
  const { data: emailCliente, isFetched: emailPronte } = useQuery({
    queryKey: ["email-cliente-preventivo", prev.id], enabled: open && !!prev.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("email_cliente_preventivo", { _preventivo_id: prev.id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: colleghi } = useQuery({
    queryKey: ["destinatari-copia-preventivo", prev.id], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_destinatari_copia_preventivo", { _preventivo_id: prev.id });
      if (error) throw error;
      return (data ?? []) as DestinatarioCopia[];
    },
  });
  const { data: sedeNome } = useQuery({
    queryKey: ["sede-nome", prev.store_id], enabled: open && !!prev.store_id,
    queryFn: async () => (await supabase.from("stores").select("nome").eq("id", prev.store_id!).maybeSingle()).data?.nome ?? null,
  });

  const soggetto = nomeIntestatarioPdf(prev);
  const applicaTemplate = (t: TemplateEmail | undefined) => {
    if (!t) return;
    const r = renderTemplate({ oggetto: t.oggetto, corpo: t.corpo }, {
      ragione_sociale: soggetto === "—" ? "" : soggetto, nome_operatore: nomeOperatore, scadenze: [],
      preventivo: { numero: prev.numero, titolo: prev.titolo, validita: prev.validita, totale_ivato: prev.totale == null ? null : Number(prev.totale), sede: sedeNome ?? null },
    }, { tipo: t.tipo });
    setTemplateId(t.id); setOggetto(r.oggetto); setCorpo(htmlInTestoSemplice(r.corpo));
  };

  // Precompilazione una volta per apertura, quando i dati sono pronti.
  useEffect(() => { if (!open) { setIniziato(false); setCc([]); setBcc([]); setTemplateId(null); setOggetto(""); setCorpo(""); setTo(""); } }, [open]);
  useEffect(() => {
    if (!open || iniziato || !templates || (prev.cliente_id && !emailPronte) || (prev.store_id && sedeNome === undefined)) return;
    setTo(destinatarioPropostoPreventivo(prev.cliente_id ? emailCliente : null, prev.lead));
    if (templates.length) applicaTemplate(templates[0]);
    else setOggetto(`Preventivo ${prev.numero ?? ""}${prev.titolo ? ` — ${prev.titolo}` : ""}`.trim());
    setIniziato(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, iniziato, templates, emailPronte, emailCliente, sedeNome]);

  const tutti = [to.trim(), ...cc, ...bcc].filter(Boolean);
  const usati = useMemo(() => new Set(tutti.map(e => e.toLowerCase())), [tutti.join("|")]);
  const limite = tutti.length >= MAX_INDIRIZZI_PREVENTIVO;
  const destDup = !!to.trim() && [...cc, ...bcc].some(e => e.toLowerCase() === to.trim().toLowerCase());
  const pronto = !!blob && isEmailValida(to.trim()) && !destDup && !!oggetto.trim() && !!corpo.trim() && tutti.length <= MAX_INDIRIZZI_PREVENTIVO;

  async function invia() {
    if (!blob || !pronto) return;
    setSending(true);
    try {
      const r = await inviaPreventivoPerEmail({ preventivoId: prev.id, pdf: blob, nomeFile: fileName, oggetto: oggetto.trim(), corpo, to: [to.trim()], cc, bcc });
      onOpenChange(false);
      toast.success(`Preventivo inviato a ${r.destinatari.join(", ")}${r.statoNuovo ? " · stato: Inviato" : ""}`);
      r.avvisi.forEach(a => toast.warning(a));
      void qc.invalidateQueries({ queryKey: ["preventivo", prev.id] });
      void qc.invalidateQueries({ queryKey: ["attivita-commerciale", "preventivo", prev.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito");
    } finally { setSending(false); }
  }

  const contentCls = "flex flex-col gap-0 p-0 left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-hidden sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg";

  return (
    <Dialog open={open} onOpenChange={v => !sending && onOpenChange(v)}>
      <DialogContent className={contentCls}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 border-b border-border text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8"><Send className="size-5 shrink-0" /> Invia il preventivo per email</DialogTitle>
          <DialogDescription className="break-words">Preventivo <strong>{prev.numero ?? "—"}</strong>{soggetto !== "—" ? <> · {prev.lead_id && !prev.cliente_id ? "Lead" : "Cliente"}: <strong>{soggetto}</strong></> : null}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
          <Sezione titolo="Destinatario">
            <Input type="email" aria-label="Destinatario" value={to} onChange={e => setTo(e.target.value)} placeholder="destinatario@esempio.it" disabled={sending} />
            {iniziato && !to.trim() && <p className="text-xs text-muted-foreground">Nessun indirizzo email per questo {prev.cliente_id ? "cliente" : "lead"}: inseriscilo a mano.</p>}
            {to.trim() && !isEmailValida(to.trim()) && <p className="text-xs text-destructive">Indirizzo email non valido.</p>}
            {destDup && <p className="text-xs text-destructive">Il destinatario è già in copia: toglilo da CC o CCN.</p>}
          </Sezione>
          <Sezione titolo="Copie">
            <CampoCopie label="Copia (CC)" valori={cc} onChange={setCc} opzioni={colleghi ?? []} usati={usati} limiteRaggiunto={limite} disabled={sending} />
            <CampoCopie label="Copia nascosta (CCN)" valori={bcc} onChange={setBcc} opzioni={colleghi ?? []} usati={usati} limiteRaggiunto={limite} disabled={sending} />
            <p className="text-[11px] text-muted-foreground">{tutti.length} di {MAX_INDIRIZZI_PREVENTIVO} indirizzi usati tra destinatario, copia e copia nascosta.</p>
          </Sezione>
          <Sezione titolo="Testo dell'email">
            {(templates?.length ?? 0) > 1 && (
              <div className="space-y-1.5">
                <Label>Modello</Label>
                <Select value={templateId ?? undefined} onValueChange={id => applicaTemplate(templates!.find(t => t.id === id))} disabled={sending}>
                  <SelectTrigger><SelectValue placeholder="Scegli un modello" /></SelectTrigger>
                  <SelectContent>{templates!.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {templates && templates.length === 0 && <p className="text-xs text-muted-foreground">Nessun modello "Invio preventivo" attivo: scrivi il testo a mano.</p>}
            <div className="space-y-1.5"><Label htmlFor="ip-oggetto">Oggetto</Label><Input id="ip-oggetto" value={oggetto} onChange={e => setOggetto(e.target.value)} disabled={sending} /></div>
            <div className="space-y-1.5"><Label htmlFor="ip-corpo">Testo</Label><Textarea id="ip-corpo" value={corpo} onChange={e => setCorpo(e.target.value)} rows={10} disabled={sending} /></div>
          </Sezione>
          <Sezione titolo="Allegato">
            {blob ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 min-w-0">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-all text-sm font-medium">{fileName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{pesoFile(blob.size)}</span>
              </div>
            ) : <p className="text-xs text-destructive">PDF non disponibile.</p>}
          </Sezione>
        </div>
        <DialogFooter className="px-4 sm:px-6 py-3 gap-2 sm:gap-2 border-t border-border shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Annulla</Button>
          <Button onClick={invia} disabled={!pronto || sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{sending ? "Invio…" : "Invia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
