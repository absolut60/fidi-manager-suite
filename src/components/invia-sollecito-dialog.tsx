import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendEmail } from "@/lib/send-email";
import {
  caricaDatiCliente,
  renderTemplate,
  type TemplateEmail,
} from "@/lib/template-email";
import { classificaScadenza } from "@/lib/scadenze";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  /** Se fornito, l'invio aggiorna questa azione (esito='da_fare' → 'fatto') invece di crearne una nuova. */
  azioneEsistenteId?: string | null;
  onSent?: () => void;
};

type ClienteInfo = { id: string; ragione_sociale: string; email: string | null; pec: string | null };

export function InviaSollecitoDialog({ open, onOpenChange, clienteId, azioneEsistenteId, onSent }: Props) {
  const qc = useQueryClient();
  const { user, profilo } = useAuth();
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";

  const [templateId, setTemplateId] = useState<string>("");
  const [destSource, setDestSource] = useState<"email" | "pec" | "custom">("email");
  const [destEmail, setDestEmail] = useState<string>("");
  const [copiaSelezionata, setCopiaSelezionata] = useState<boolean>(false);
  const [sending, setSending] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setSending(false);
    }
  }, [open]);

  // Cliente
  const { data: cliente } = useQuery({
    queryKey: ["invia-sollecito-cliente", clienteId],
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

  // Templates attivi
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

  // Imposta destinatario di default su email→pec→custom quando arriva il cliente
  useEffect(() => {
    if (!cliente) return;
    if (cliente.email) { setDestSource("email"); setDestEmail(cliente.email); }
    else if (cliente.pec) { setDestSource("pec"); setDestEmail(cliente.pec); }
    else { setDestSource("custom"); setDestEmail(""); }
  }, [cliente]);

  // Preset template di default
  useEffect(() => {
    if (templates && templates.length && !templateId) {
      setTemplateId(templates[0].id);
    }
  }, [templates, templateId]);

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Dati per rendering anteprima + linking scadenze
  const { data: datiTemplate, isFetching: datiLoading } = useQuery({
    queryKey: ["sollecito-dati", clienteId, nomeOperatore],
    queryFn: () => caricaDatiCliente(clienteId, nomeOperatore),
    enabled: open && !!clienteId,
  });

  // ID delle scadenze scadute da linkare
  const { data: scaduteIds } = useQuery({
    queryKey: ["sollecito-scadute-ids", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, stato_contabile, giorni_ritardo, tempi_scadenza")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => classificaScadenza(s) === "scaduto")
        .map((s: any) => s.id as string);
    },
    enabled: open && !!clienteId,
  });

  const rendered = useMemo(() => {
    if (!selectedTemplate || !datiTemplate) return null;
    return renderTemplate(
      { oggetto: selectedTemplate.oggetto, corpo: selectedTemplate.corpo },
      datiTemplate,
    );
  }, [selectedTemplate, datiTemplate]);

  function onPickSource(src: "email" | "pec" | "custom") {
    setDestSource(src);
    if (src === "email") setDestEmail(cliente?.email ?? "");
    else if (src === "pec") setDestEmail(cliente?.pec ?? "");
  }

  function isValidEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  }

  const senzaIndirizzo = !!cliente && !cliente.email && !cliente.pec;
  const copiaEmail = profilo?.email ?? user?.email ?? null;
  const copiaDisponibile = !!copiaEmail && isValidEmail(copiaEmail);

  async function handleInvia() {
    if (!cliente || !selectedTemplate || !rendered) return;
    const dest = destEmail.trim();
    if (!isValidEmail(dest)) {
      toast.error("Inserisci un indirizzo email valido");
      return;
    }
    setSending(true);
    try {
      const totaleScaduto = (datiTemplate?.scadenze ?? []).reduce(
        (a, s) => a + Number(s.importo_scadenza ?? 0), 0,
      );

      const bccCopia = copiaSelezionata && copiaDisponibile ? copiaEmail : null;

      // TODO: log temporaneo per verificare il BCC — rimuovere dopo la verifica
      console.log("[sollecito] invio", { to: dest, bcc: bccCopia, subject: rendered.oggetto });

      const ok = await sendEmail({
        to: dest,
        ...(bccCopia ? { bcc: bccCopia } : {}),
        subject: rendered.oggetto,
        html: rendered.corpo,
      });

      if (!ok) {
        toast.error("Invio fallito. Riprova o verifica l'indirizzo.");
        setSending(false);
        return;
      }

      const noteRiassunto = `Inviato template "${selectedTemplate.nome}" a ${dest}${bccCopia ? ` (bcc ${bccCopia})` : ""}`;

      if (azioneEsistenteId) {
        const { error } = await supabase
          .from("azioni_recupero")
          .update({
            esito: "fatto",
            data_azione: new Date().toISOString(),
            note: noteRiassunto,
            operatore_id: user?.id ?? null,
          })
          .eq("id", azioneEsistenteId);
        if (error) throw error;
      } else {
        const { data: inserita, error: e1 } = await supabase
          .from("azioni_recupero")
          .insert({
            cliente_id: clienteId,
            operatore_id: user?.id ?? null,
            tipo: "email",
            esito: "fatto",
            data_azione: new Date().toISOString(),
            importo_riferimento: totaleScaduto,
            note: noteRiassunto,
          })
          .select("id")
          .single();
        if (e1) throw e1;

        const ids = scaduteIds ?? [];
        if (ids.length && inserita?.id) {
          const rows = ids.map((sid) => ({ azione_id: inserita.id, scadenza_id: sid }));
          const { error: e2 } = await supabase.from("azioni_recupero_scadenze").insert(rows);
          if (e2) throw e2;
        }
      }

      toast.success("Sollecito inviato");
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-calendario"] });
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
            <Send className="size-5" /> Invia sollecito
          </DialogTitle>
          <DialogDescription>
            {cliente ? <>Cliente: <strong>{cliente.ragione_sociale}</strong></> : "Caricamento cliente..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template */}
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Seleziona un template..." /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates && templates.length === 0 && (
              <p className="text-xs text-destructive">Nessun template attivo. Creane uno in Template Email.</p>
            )}
          </div>

          {/* Destinatario */}
          <div className="space-y-2">
            <Label>Destinatario</Label>
            <RadioGroup value={destSource} onValueChange={(v) => onPickSource(v as any)} className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="email" id="dest-email" />
                <span className="text-muted-foreground">Email cliente:</span>
                <span className="font-medium">{cliente?.email || <em className="text-muted-foreground/70">non presente</em>}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="pec" id="dest-pec" />
                <span className="text-muted-foreground">PEC cliente:</span>
                <span className="font-medium">{cliente?.pec || <em className="text-muted-foreground/70">non presente</em>}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="custom" id="dest-custom" />
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
                <span>Il cliente non ha email né PEC. Inserisci manualmente un indirizzo prima di inviare.</span>
              </div>
            )}
          </div>

          {/* CC operatore */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={ccOperatore} onCheckedChange={(v) => setCcOperatore(!!v)} />
            <span>Mettimi in CC {ccEmail && <span className="text-muted-foreground">({ccEmail})</span>}</span>
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
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">{rendered.oggetto}</div>
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
          <Button onClick={handleInvia} disabled={sending || !rendered || !templateId} className="gap-1.5">
            <Send className="size-4" /> {sending ? "Invio in corso..." : "Invia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
