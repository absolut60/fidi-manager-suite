import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const MESSAGE_ID_SPIEGAZIONE =
  "Identificativo assegnato dal server di posta al momento dell'accettazione. " +
  "Prova che il messaggio è stato accettato dal server, non che sia stato consegnato alla casella del destinatario.";

/**
 * Mostra il message-id di un invio email: testo piccolo monospace, copiabile,
 * con tooltip che ne spiega il significato (prova di accettazione, non di consegna).
 */
export function MessageIdCell({
  messageId,
  className = "",
}: {
  messageId: string | null | undefined;
  className?: string;
}) {
  const [copiato, setCopiato] = useState(false);

  if (!messageId) {
    return <span className={`text-xs text-muted-foreground ${className}`}>—</span>;
  }

  const copia = () => {
    void navigator.clipboard?.writeText(messageId).then(() => {
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1500);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copia}
            className={`inline-flex max-w-[200px] items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground ${className}`}
          >
            <span className="truncate">{messageId}</span>
            {copiato ? (
              <Check className="size-3 shrink-0 text-emerald-600" />
            ) : (
              <Copy className="size-3 shrink-0 opacity-60" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-mono text-[11px] break-all">{messageId}</p>
          <p className="mt-1 text-xs">{MESSAGE_ID_SPIEGAZIONE}</p>
          <p className="mt-1 text-[11px] opacity-70">Clicca per copiare.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
