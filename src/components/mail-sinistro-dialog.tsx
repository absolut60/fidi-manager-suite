import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { sendEmailDetailed } from "@/lib/send-email";
import { wrapEmailHtml } from "@/lib/template-email";
import { escapeHtml } from "@/lib/template-email-render";
import { isEmailValida } from "@/lib/email-validazione";
import { useAuth } from "@/hooks/use-auth";

function testoToHtml(testo: string): string {
  return testo
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function MailSinistroDialog({
  open,
  onOpenChange,
  polizzaId,
  ragioneSociale,
  importoSuggerito,
  promessaData,
  fmtDate,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  polizzaId: string;
  ragioneSociale: string | null;
  importoSuggerito?: number | null;
  promessaData?: string | null;
  fmtDate?: (v: unknown) => string;
  onDone?: () => void;
}) {
  const [destinatario, setDestinatario] = useState("");
  const [fromName, setFromName] = useState("MADE – FidiManager");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [notaInterna, setNotaInterna] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const { profilo, user } = useAuth();
  const nomeMittente = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Amministrazione MADE";
  const emailMittente = profilo?.email ?? user?.email ?? null;

  useEffect(() => {
    if (!open) return;
    const importo =
      importoSuggerito == null
        ? ""
        : new Intl.NumberFormat("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(Number(importoSuggerito));
    const rigaPromessa = promessaData
      ? `Il cliente ha promesso un pagamento entro il ${fmtDate ? fmtDate(promessaData) : promessaData}.`
      : "";
    setDestinatario("");
    setFromName("MADE – FidiManager");
    setOggetto(`Apertura sinistro - ${ragioneSociale ?? ""}`);
    setCorpo(
      `Buongiorno,\n\ncon la presente siamo a chiedervi apertura del sinistro per il nostro cliente ${ragioneSociale ?? ""} per un importo di ${importo} €\n\nTrasmettiamo in allegato:\nScheda contabile\nFattura insoluta\n\nDichiariamo che siete gli unici assicuratori a intervenire per questo cliente.\n\n${rigaPromessa}\n\nIn attesa di un riscontro o di richiesta ulteriori chiarimenti, porgo cordiali saluti`,
    );
    setNotaInterna("");
    setFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, polizzaId]);

  const anteprimaHtml = useMemo(
    () =>
      wrapEmailHtml(
        testoToHtml(corpo),
        null,
        { nome: nomeMittente, email: emailMittente },
        { senzaBande: true, sottotitolo: "Assicurazione crediti" },
      ),
    [corpo, nomeMittente, emailMittente],
  );

  async function inviaEApri() {
    const dest = destinatario.trim();
    if (!isEmailValida(dest)) {
      toast.error("Indirizzo email destinatario non valido");
      return;
    }
    if (!corpo.trim()) {
      toast.error("Il corpo della mail non può essere vuoto");
      return;
    }
    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          content: await fileToBase64(f),
          contentType: f.type || "application/octet-stream",
        })),
      );

      const esito = await sendEmailDetailed({
        to: dest,
        subject: oggetto,
        html: wrapEmailHtml(
          testoToHtml(corpo),
          null,
          { nome: nomeMittente, email: emailMittente },
          { senzaBande: true, sottotitolo: "Assicurazione crediti", useCid: true },
        ),
        inlineLogo: true,
        fromName: fromName.trim() || undefined,
        ...(attachments.length ? { attachments } : {}),
      });

      if (!esito.ok) {
        toast.error(`Invio fallito: ${esito.err ?? "errore sconosciuto"}`, { duration: 12000 });
        return;
      }

      const { error } = await (supabase.rpc as any)("apri_sinistro_pouey", {
        _polizza_id: polizzaId,
        _importo_sinistro: Number(importoSuggerito ?? 0),
        _nota: notaInterna.trim() || null,
      });
      if (error) {
        toast.error(error.message ?? "Errore apertura sinistro");
        return;
      }

      toast.success("Sinistro aperto e mail inviata");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && sending) return; onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prepara mail sinistro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome mittente</Label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="MADE – FidiManager"
            />
          </div>
          <div>
            <Label>Destinatario</Label>
            <Input
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="email ufficio sinistri POUEY"
            />
          </div>
          <div>
            <Label>Oggetto</Label>
            <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
          </div>
          <div>
            <Label>Corpo</Label>
            <Textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
          </div>
          <div>
            <Label>Allegati (PDF o immagini)</Label>
            <Input
              type="file"
              multiple
              accept="application/pdf,image/*"
              onChange={(e) => {
                const nuovi = Array.from(e.target.files ?? []);
                if (nuovi.length) setFiles((prev) => [...prev, ...nuovi]);
                e.target.value = "";
              }}
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="truncate flex-1">{f.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label>Nota interna (facoltativa)</Label>
            <Textarea rows={3} value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)} />
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm space-y-0.5">
              <div>
                <span className="text-muted-foreground">Da:</span>{" "}
                {fromName.trim() || "MADE – FidiManager"}{" "}
                <span className="text-xs text-muted-foreground">(indirizzo aziendale MADE)</span>
              </div>
              <div>
                <span className="text-muted-foreground">A:</span>{" "}
                {destinatario.trim() || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Oggetto:</span> {oggetto}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Anteprima</div>
              <iframe
                title="Anteprima email"
                sandbox=""
                srcDoc={anteprimaHtml}
                className="w-full rounded border"
                style={{ height: 420 }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Annulla
          </Button>
          <Button onClick={inviaEApri} disabled={sending}>
            {sending && <Loader2 className="size-4 mr-1 animate-spin" />}
            Invia e apri sinistro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
