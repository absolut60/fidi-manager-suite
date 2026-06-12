import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, Users, ListChecks, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/hooks/use-config";
import { caricaDatiCliente, renderTemplate, type TemplateEmail } from "@/lib/template-email";
import { avviaCampagnaSollecito } from "@/lib/sollecito-massivo.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cliente_ids già selezionati a schermo (selezione multipla esistente). */
  clienteIdsSelezionati: string[];
  /** Cliente_ids che corrispondono ai filtri correnti (anche oltre la pagina visibile). */
  clienteIdsFiltrati: string[];
};

export function InvioMassivoDialog({
  open,
  onOpenChange,
  clienteIdsSelezionati,
  clienteIdsFiltrati,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cfg = useConfig();
  const avvia = useServerFn(avviaCampagnaSollecito);

  const [modo, setModo] = useState<"selezionati" | "filtrati">("selezionati");
  const [templateId, setTemplateId] = useState<string>("");
  const [preferenza, setPreferenza] = useState<"email" | "pec">("email");
  const [nota, setNota] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setNota("");
    } else {
      // Se non ci sono righe selezionate, preimposta "filtrati"
      setModo(clienteIdsSelezionati.length > 0 ? "selezionati" : "filtrati");
    }
  }, [open, clienteIdsSelezionati.length]);

  const clienteIds = useMemo(
    () => (modo === "selezionati" ? clienteIdsSelezionati : clienteIdsFiltrati),
    [modo, clienteIdsSelezionati, clienteIdsFiltrati],
  );
  const totale = clienteIds.length;

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
    if (templates && templates.length && !templateId) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Anteprima su un cliente di esempio del gruppo (il primo)
  const esempioId = clienteIds[0] ?? null;
  const { data: datiEsempio } = useQuery({
    queryKey: ["sollecito-massivo-preview", esempioId],
    queryFn: () => caricaDatiCliente(esempioId!, "Operatore"),
    enabled: open && !!esempioId,
  });

  const anteprima = useMemo(() => {
    if (!selectedTemplate || !datiEsempio) return null;
    return renderTemplate(
      { oggetto: selectedTemplate.oggetto, corpo: selectedTemplate.corpo },
      datiEsempio,
    );
  }, [selectedTemplate, datiEsempio]);

  // Stima durata
  const blocco = Math.max(1, cfg.sollecito_massivo_blocco);
  const pausa = Math.max(0, cfg.sollecito_massivo_pausa_sec);
  const numBlocchi = Math.max(1, Math.ceil(totale / blocco));
  const secondiStimati = (numBlocchi - 1) * pausa + numBlocchi * blocco * 2; // ~2s per email
  const minutiStimati = Math.ceil(secondiStimati / 60);

  async function handleAvvia() {
    if (!selectedTemplate) return;
    if (totale === 0) {
      toast.error("Nessun cliente selezionato");
      return;
    }
    setSubmitting(true);
    try {
      const res = await avvia({
        data: {
          templateId: selectedTemplate.id,
          preferenzaIndirizzo: preferenza,
          nota: nota.trim() || null,
          clienteIds,
        },
      });
      toast.success(`Campagna avviata: ${res.totale} destinatari`);
      qc.invalidateQueries({ queryKey: ["campagne-sollecito"] });
      onOpenChange(false);
      navigate({ to: "/recupero-crediti-campagne" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Errore avvio campagna: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5" /> Invio massivo solleciti
          </DialogTitle>
          <DialogDescription>
            Lancia una campagna email graduale verso più clienti, rispettando i limiti del server di posta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Modalità destinatari */}
          <div className="space-y-2">
            <Label>Destinatari</Label>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as "selezionati" | "filtrati")} className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="selezionati" disabled={clienteIdsSelezionati.length === 0} />
                <ListChecks className="size-4 text-muted-foreground" />
                <span>Solo i clienti selezionati a schermo</span>
                <span className="ml-auto font-medium">{clienteIdsSelezionati.length}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="filtrati" />
                <Users className="size-4 text-muted-foreground" />
                <span>Tutti i clienti che corrispondono ai filtri correnti</span>
                <span className="ml-auto font-medium">{clienteIdsFiltrati.length}</span>
              </label>
            </RadioGroup>
          </div>

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

          {/* Preferenza indirizzo */}
          <div className="space-y-1.5">
            <Label>Indirizzo preferito</Label>
            <RadioGroup value={preferenza} onValueChange={(v) => setPreferenza(v as "email" | "pec")} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="email" /> Email
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="pec" /> PEC
              </label>
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              Se l'indirizzo preferito è vuoto, viene usato automaticamente l'altro. Senza nessun indirizzo, il cliente
              viene marcato come "saltato_no_indirizzo".
            </p>
          </div>

          {/* Nota */}
          <div className="space-y-1.5">
            <Label>Nota campagna (opzionale)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es: Sollecito mensile gennaio" rows={2} />
          </div>

          {/* Avviso throttling */}
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              L'invio è graduale per rispettare i limiti del server di posta: ~<strong>{blocco}</strong> email ogni{" "}
              <strong>{pausa}s</strong>. Per <strong>{totale}</strong> clienti durerà circa{" "}
              <strong>{minutiStimati} min</strong>.
            </div>
          </div>

          {/* Anteprima */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Eye className="size-3.5" /> Anteprima (cliente di esempio)
            </Label>
            {!anteprima ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Oggetto</div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">{anteprima.oggetto}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Corpo</div>
                  <div
                    className="rounded border border-border bg-background px-4 py-3 text-sm max-h-72 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: anteprima.corpo }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleAvvia} disabled={submitting || !templateId || totale === 0} className="gap-1.5">
            <Send className="size-4" />
            {submitting ? "Avvio..." : `Avvia campagna (${totale})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
