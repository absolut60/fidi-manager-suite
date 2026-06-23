import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendEmail } from "@/lib/send-email";
import {
  caricaDatiCliente,
  caricaSedeCliente,
  renderTemplate,
  wrapEmailHtml,
  type TemplateEmail,
} from "@/lib/template-email";
import { classificaScadenza } from "@/lib/scadenze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  onSent?: () => void;
};

type ClienteInfo = { id: string; ragione_sociale: string; email: string | null; pec: string | null };

export function EmailLiberaDialog({ open, onOpenChange, clienteId, onSent }: Props) {
  const qc = useQueryClient();
  const { user, profilo } = useAuth();
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";

  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [templateBaseId, setTemplateBaseId] = useState<string>("");
  const [destSource, setDestSource] = useState<"email" | "pec" | "custom">("email");
  const [destEmail, setDestEmail] = useState<string>("");
  const [collegaScadenze, setCollegaScadenze] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSending(false);
    } else {
      setOggetto("");
      setCorpo("");
      setTemplateBaseId("");
      setCollegaScadenze(false);
    }
  }, [open]);

  const { data: cliente } = useQuery({
    queryKey: ["email-libera-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, email, pec")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data as ClienteInfo | null;
    },
    enabled: open && !!clienteId,
  });

  const { data: templates } = useQuery({
    queryKey: ["template-email-attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_email")
        .select("id, nome, oggetto, corpo, tipo, attivo")
        .eq("attivo", true)
        .order("nome");
      if (error) throw error;
      return data as TemplateEmail[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!cliente) return;
    if (cliente.email) { setDestSource("email"); setDestEmail(cliente.email); }
    else if (cliente.pec) { setDestSource("pec"); setDestEmail(cliente.pec); }
    else { setDestSource("custom"); setDestEmail(""); }
  }, [cliente]);

  const { data: datiTemplate, isFetching: datiLoading } = useQuery({
    queryKey: ["email-libera-dati", clienteId, nomeOperatore],
    queryFn: () => caricaDatiCliente(clienteId, nomeOperatore),
    enabled: open && !!clienteId,
  });

  const { data: datiSede } = useQuery({
    queryKey: ["email-libera-sede", clienteId],
    queryFn: () => caricaSedeCliente(clienteId),
    enabled: open && !!clienteId,
  });

  const { data: scaduteIds } = useQuery({
    queryKey: ["email-libera-scadute", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, stato_contabile, giorni_ritardo, tempi_scadenza, data_scadenza, data_pagamento_effettiva")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => classificaScadenza(s) === "scaduto")
        .map((s: any) => s.id as string);
    },
    enabled: open && !!clienteId,
  });

  function precaricaDaTemplate(id: string) {
    setTemplateBaseId(id);
    const t = templates?.find((x) => x.id === id);
    if (t) {
      setOggetto(t.oggetto ?? "");
      setCorpo(t.corpo ?? "");
    }
  }

  const corpoHtml = useMemo(() => {
    // Trasforma newline in <br/> se il corpo non sembra HTML
    const sembraHtml = /<[a-z][\s\S]*>/i.test(corpo);
    return sembraHtml ? corpo : corpo.replace(/\n/g, "<br/>");
  }, [corpo]);

  const rendered = useMemo(() => {
    if (!datiTemplate) return null;
    const base = renderTemplate({ oggetto, corpo: corpoHtml }, datiTemplate);
    const corpoCompleto = wrapEmailHtml(base.corpo, datiSede ?? null, {
      nome: nomeOperatore,
      email: user?.email ?? null,
    }, { senzaBande: true });
    return { oggetto: base.oggetto, corpo: corpoCompleto };
  }, [oggetto, corpoHtml, datiTemplate, datiSede, nomeOperatore, user?.email]);

  function onPickSource(src: "email" | "pec" | "custom") {
    setDestSource(src);
    if (src === "email") setDestEmail(cliente?.email ?? "");
    else if (src === "pec") setDestEmail(cliente?.pec ?? "");
  }

  // Validazione email: fonte unica di verità in src/lib/email-validazione.ts
  const isValidEmail = isEmailValida;

  const senzaIndirizzo = !!cliente && !cliente.email && !cliente.pec;

  async function handleInvia() {
    if (!cliente || !rendered) return;
    const dest = destEmail.trim();
    if (!isValidEmail(dest)) {
      toast.error("Inserisci un indirizzo email valido");
      return;
    }
    if (!oggetto.trim()) {
      toast.error("Inserisci un oggetto");
      return;
    }
    if (!corpo.trim()) {
      toast.error("Inserisci il corpo dell'email");
      return;
    }
    setSending(true);
    try {
      const baseRender = renderTemplate({ oggetto, corpo: corpoHtml }, datiTemplate!);
      const htmlPerEmail = wrapEmailHtml(baseRender.corpo, datiSede ?? null, {
        nome: nomeOperatore,
        email: user?.email ?? null,
      }, { useCid: true, senzaBande: true });

      const ok = await sendEmail({
        to: dest,
        subject: baseRender.oggetto,
        html: htmlPerEmail,
        fromName: "Recupero Crediti MADE",
        replyTo: user?.email ?? undefined,
        inlineLogo: true,
      });

      if (!ok) {
        toast.error("Invio fallito. Riprova o verifica l'indirizzo.");
        setSending(false);
        return;
      }

      const totaleScaduto = (datiTemplate?.scadenze ?? []).reduce(
        (a, s) => a + Number(s.importo_scadenza ?? 0), 0,
      );

      const { data: inserita, error: e1 } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: clienteId,
          operatore_id: user?.id ?? null,
          tipo: "email",
          esito: "fatto",
          data_azione: new Date().toISOString(),
          importo_riferimento: totaleScaduto,
          note: `Email libera inviata a ${dest}`,
          livello_sollecito: null,
          email_oggetto: rendered.oggetto,
          email_corpo_html: rendered.corpo,
          email_destinatario: dest,
        })
        .select("id")
        .single();
      if (e1) throw e1;

      if (collegaScadenze) {
        const ids = scaduteIds ?? [];
        if (ids.length && inserita?.id) {
          const rows = ids.map((sid) => ({ azione_id: inserita.id, scadenza_id: sid }));
          const { error: e2 } = await supabase.from("azioni_recupero_scadenze").insert(rows);
          if (e2) throw e2;
        }
      }

      toast.success("Email inviata");
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-calendario"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Errore durante il salvataggio dell'azione");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" /> Email libera
          </DialogTitle>
          <DialogDescription>
            {cliente ? <>Cliente: <strong>{cliente.ragione_sociale}</strong> — comunicazione personalizzata, non conta come sollecito.</> : "Caricamento cliente..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Parti da template (opzionale) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Parti da un template (opzionale)</Label>
            <Select value={templateBaseId} onValueChange={precaricaDaTemplate}>
              <SelectTrigger><SelectValue placeholder="Nessuno (scrivi da zero)" /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destinatario */}
          <div className="space-y-2">
            <Label>Destinatario</Label>
            <RadioGroup value={destSource} onValueChange={(v) => onPickSource(v as any)} className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="email" id="dest-email-l" />
                <span className="text-muted-foreground">Email cliente:</span>
                <span className="font-medium">{cliente?.email || <em className="text-muted-foreground/70">non presente</em>}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="pec" id="dest-pec-l" />
                <span className="text-muted-foreground">PEC cliente:</span>
                <span className="font-medium">{cliente?.pec || <em className="text-muted-foreground/70">non presente</em>}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="custom" id="dest-custom-l" />
                <span>Indirizzo manuale</span>
              </label>
            </RadioGroup>
            <Input
              type="email"
              value={destEmail}
              onChange={(e) => { setDestEmail(e.target.value); setDestSource("custom"); }}
              placeholder="destinatario@esempio.it"
            />
            {senzaIndirizzo && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>Il cliente non ha email né PEC. Inserisci manualmente un indirizzo.</span>
              </div>
            )}
          </div>

          {/* Oggetto + corpo */}
          <div className="space-y-1.5">
            <Label>Oggetto</Label>
            <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} placeholder="Oggetto dell'email" />
          </div>
          <div className="space-y-1.5">
            <Label>Corpo</Label>
            <Textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder={"Scrivi qui il messaggio.\nPlaceholder disponibili: {{ragione_sociale}}, {{totale_scaduto}}, {{elenco_scadenze}}, {{data_oggi}}, {{nome_operatore}}"}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Puoi usare HTML o testo. I newline diventano &lt;br&gt; se non e HTML.
            </p>
          </div>

          {/* Opzioni */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={collegaScadenze}
              onCheckedChange={(v) => setCollegaScadenze(!!v)}
            />
            <span>Collega le scadenze scadute aperte ({scaduteIds?.length ?? 0}) — opzionale</span>
          </label>

          {/* Anteprima */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Anteprima</Label>
            {datiLoading || !rendered ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Oggetto</div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">{rendered.oggetto || <em className="text-muted-foreground">(vuoto)</em>}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Corpo</div>
                  <div
                    className="rounded border border-border bg-background px-4 py-3 text-sm max-h-80 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: rendered.corpo }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Annulla</Button>
          <Button onClick={handleInvia} disabled={sending || !rendered} className="gap-1.5">
            <Mail className="size-4" /> {sending ? "Invio in corso..." : "Invia email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
