import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { caricaDatiClienteLettera, renderLettera, type TemplateLettera } from "@/lib/template-lettera";
import { generaLetteraPdf } from "@/lib/lettera-pdf.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clienteId: string;
  ragioneSociale?: string;
  attachToAzioneId?: string | null;
  onGenerated?: () => void;
};

export function LetteraPdfDialog({
  open, onOpenChange, clienteId, ragioneSociale, attachToAzioneId, onGenerated,
}: Props) {
  const qc = useQueryClient();
  const { user, profilo } = useAuth();
  const genera = useServerFn(generaLetteraPdf);
  const [templateId, setTemplateId] = useState<string>("");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [busy, setBusy] = useState(false);

  // Carica template attivi
  const { data: templates, isLoading: tplLoading } = useQuery({
    queryKey: ["template_lettera", "attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_lettera")
        .select("id, nome, oggetto, corpo, tipo, usa_dati_automatici, attivo")
        .eq("attivo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateLettera[];
    },
    enabled: open,
  });

  // Reset alla riapertura
  useEffect(() => {
    if (!open) {
      setTemplateId(""); setOggetto(""); setCorpo(""); setBusy(false);
    }
  }, [open]);

  // Quando l'utente sceglie un template, renderizza l'anteprima con i dati reali.
  // Se templateId === "__libera__", lascia il campo vuoto per scrittura libera.
  useEffect(() => {
    if (!open || !templateId) return;
    if (templateId === "__libera__") {
      setOggetto((o) => o);
      setCorpo((c) => c);
      return;
    }
    const tpl = (templates ?? []).find((t) => t.id === templateId);
    if (!tpl) return;
    let cancelled = false;
    (async () => {
      try {
        const nomeOp = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || (user?.email ?? "");
        const dati = await caricaDatiClienteLettera(clienteId, nomeOp);
        const r = renderLettera({ oggetto: tpl.oggetto, corpo: tpl.corpo }, dati);
        if (cancelled) return;
        setOggetto(r.oggetto);
        setCorpo(r.corpo);
      } catch (e: any) {
        if (!cancelled) toast.error("Errore anteprima: " + (e?.message ?? "—"));
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, open]); // eslint-disable-line

  const isLibera = templateId === "__libera__";
  const canGen = !!templateId && !!corpo.trim() && (!isLibera || !!oggetto.trim()) && !busy;

  async function handleGenera() {
    if (!canGen) return;
    setBusy(true);
    try {
      const res = await genera({
        data: {
          templateId: isLibera ? null : templateId,
          clienteId,
          oggettoOverride: oggetto,
          corpoOverride: corpo,
          attachToAzioneId: attachToAzioneId ?? null,
        },
      });

      // Download del PDF
      const bin = atob(res.pdfBase64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.fileName; a.click();
      URL.revokeObjectURL(url);

      toast.success("Lettera generata e allegata");
      qc.invalidateQueries({ queryKey: ["allegati", "azione_recupero", res.azioneId] });
      qc.invalidateQueries({ queryKey: ["allegati"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });

      onGenerated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Generazione fallita: " + (e?.message ?? "errore"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" /> Genera lettera PDF
          </DialogTitle>
          <DialogDescription>
            {ragioneSociale ? `Destinatario: ${ragioneSociale}` : "Scegli un modello, rivedi il testo e genera il PDF."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Modello lettera</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={tplLoading || busy}>
              <SelectTrigger>
                <SelectValue placeholder={tplLoading ? "Caricamento…" : "Scegli un modello attivo"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__libera__">— Modalita libera (senza modello) —</SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
                {!tplLoading && !(templates?.length) && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nessun modello attivo (usa modalita libera)</div>
                )}
              </SelectContent>

            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Oggetto</Label>
            <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} disabled={busy || !templateId} />
          </div>

          <div className="space-y-1.5">
            <Label>Corpo (anteprima editabile)</Label>
            <Textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={16}
              className="font-mono text-xs"
              disabled={busy || !templateId}
              placeholder="Seleziona un modello per caricare l'anteprima"
            />
            <p className="text-[11px] text-muted-foreground">
              Il PDF includera logo MADE, sede mittente, intestazione destinatario, luogo/data, oggetto, corpo, firma e footer legale.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={handleGenera} disabled={!canGen}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Genera PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
