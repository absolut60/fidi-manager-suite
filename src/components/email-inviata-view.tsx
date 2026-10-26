import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AllegatiSection } from "@/components/allegati-section";

type Props = {
  destinatario: string | null;
  oggetto: string | null;
  corpoHtml: string | null;
  cc?: string | null;
  bcc?: string | null;
  /** Id dell'azione: mostra gli allegati inviati (entita_tipo azione_recupero). */
  azioneId?: string | null;
  clienteId?: string | null;
};

export function EmailInviataView({ destinatario, oggetto, corpoHtml, cc, bcc, azioneId, clienteId }: Props) {
  if (!corpoHtml) return null;

  async function copia() {
    try {
      // copia il testo (strip HTML tags)
      const tmp = document.createElement("div");
      tmp.innerHTML = corpoHtml ?? "";
      const text = tmp.innerText;
      await navigator.clipboard.writeText(text);
      toast.success("Testo copiato negli appunti");
    } catch {
      toast.error("Impossibile copiare");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Email inviata
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={copia} className="h-7 gap-1.5">
          <Copy className="size-3.5" /> Copia testo
        </Button>
      </div>
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Destinatario: </span>
          <span className="font-medium break-words">{destinatario ?? "—"}</span>
        </div>
        {cc && (
          <div className="break-words">
            <span className="text-muted-foreground">Copia: </span>
            <span className="font-medium">{cc}</span>
          </div>
        )}
        {bcc && (
          <div className="break-words">
            <span className="text-muted-foreground">Copia nascosta: </span>
            <span className="font-medium">{bcc}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Oggetto: </span>
          <span className="font-medium">{oggetto ?? "—"}</span>
        </div>
      </div>
      <div
        className="rounded-md border border-border bg-background px-4 py-3 text-sm max-h-96 overflow-y-auto"
        dangerouslySetInnerHTML={{ __html: corpoHtml }}
      />
      {azioneId && (
        <AllegatiSection
          entitaTipo="azione_recupero"
          entitaId={azioneId}
          clienteId={clienteId ?? null}
          canEdit={false}
          compact
          title="Allegati inviati"
        />
      )}
    </div>
  );
}
