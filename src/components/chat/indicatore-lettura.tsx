import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * FM45: soglia delle conferme di lettura = momento in cui è stata applicata la
 * migrazione 0046 (messaggi_letture). I messaggi creati prima non hanno letture
 * registrate, quindi per loro l'indicatore non viene mostrato.
 */
export const SOGLIA_CONFERME_LETTURA = "2026-10-17T09:13:00Z";

export type LetturaMessaggio = { destinatari: number; letti: number };

const fmtDataOra = (v: string) =>
  new Date(v).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtOra = (v: string) =>
  new Date(v).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const fmtGiorno = (v: string) =>
  new Date(v).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });

function ElencoLetture({ messaggioId, diretto }: { messaggioId: string; diretto: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["chat", "letture-messaggio", messaggioId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_letture_messaggio", { _messaggio_id: messaggioId });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        <Loader2 className="size-4 inline animate-spin mr-1" />Caricamento…
      </div>
    );
  }
  const righe = data ?? [];
  const nome = (r: { nome: string | null; cognome: string | null }) =>
    `${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "—";
  if (diretto && righe.length === 1) {
    const r = righe[0];
    return (
      <div className="text-sm break-words">
        {r.letto_at
          ? `✓✓ Letto alle ${fmtOra(r.letto_at)} del ${fmtGiorno(r.letto_at)}`
          : "✓ Inviato, non ancora letto"}
      </div>
    );
  }
  const letti = righe.filter((r) => r.letto_at);
  const nonLetti = righe.filter((r) => !r.letto_at);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-semibold mb-1">Letto ({letti.length})</div>
        {letti.length === 0 ? (
          <div className="text-muted-foreground">Nessuno</div>
        ) : (
          <ul className="space-y-1">
            {letti.map((r) => (
              <li key={r.user_id} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0 break-words">{nome(r)}</span>
                <span className="text-muted-foreground shrink-0">{fmtDataOra(r.letto_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="font-semibold mb-1">Non ancora letto ({nonLetti.length})</div>
        {nonLetti.length === 0 ? (
          <div className="text-muted-foreground">Nessuno</div>
        ) : (
          <ul className="space-y-1">
            {nonLetti.map((r) => (
              <li key={r.user_id} className="break-words">{nome(r)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function IndicatoreLettura({
  messaggioId,
  lettura,
}: {
  messaggioId: string;
  lettura: LetturaMessaggio;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { destinatari, letti } = lettura;
  if (destinatari <= 0) return null;
  const diretto = destinatari === 1;
  const tutti = letti >= destinatari;
  const etichetta =
    letti === 0 ? "Inviato" : tutti ? "Letto" : `Letto da ${letti} di ${destinatari}`;
  const Icona = letti === 0 ? Check : CheckCheck;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`inline-flex items-center gap-0.5 rounded px-1 -mx-1 min-h-6 ${
        tutti ? "font-semibold text-white" : ""
      } hover:underline`}
      aria-label={`Stato lettura: ${etichetta}`}
    >
      <Icona className="size-3 shrink-0" />
      <span>{etichetta}</span>
    </button>
  );

  const titolo = "Lettura del messaggio";

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{titolo}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              {open && <ElencoLetture messaggioId={messaggioId} diretto={diretto} />}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto" align="end">
        <div className="font-semibold text-sm mb-2">{titolo}</div>
        {open && <ElencoLetture messaggioId={messaggioId} diretto={diretto} />}
      </PopoverContent>
    </Popover>
  );
}
