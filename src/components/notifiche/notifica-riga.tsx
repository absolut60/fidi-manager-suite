import type { KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Notifica } from "@/lib/notifiche";
import { cn } from "@/lib/utils";

export function NotificaRiga({
  notifica,
  onSegnaLetta,
  onAttivata,
  className,
}: {
  notifica: Notifica;
  onSegnaLetta: (id: string) => Promise<void>;
  onAttivata?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const attivabile = !notifica.letta || Boolean(notifica.link);

  async function attiva() {
    if (!attivabile) return;
    if (!notifica.letta) await onSegnaLetta(notifica.id);
    onAttivata?.();
    const destinazione = notifica.link;
    if (destinazione) navigate({ to: destinazione });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void attiva();
  }

  return (
    <div
      role={attivabile ? "button" : undefined}
      tabIndex={attivabile ? 0 : undefined}
      onClick={() => void attiva()}
      onKeyDown={attivabile ? onKeyDown : undefined}
      className={cn(
        "px-4 py-3",
        attivabile && "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        !notifica.letta && "bg-accent/5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {!notifica.letta && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium break-words">{notifica.titolo}</div>
          {notifica.messaggio && (
            <div className="mt-0.5 text-xs text-muted-foreground break-words">
              {notifica.messaggio}
            </div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(notifica.created_at), { addSuffix: true, locale: it })}
          </div>
        </div>
        {notifica.link && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      </div>
    </div>
  );
}
