import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCheck, FileText, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * FM45: soglia delle conferme di lettura = momento in cui è stata applicata la
 * migrazione 0046 (messaggi_letture). I messaggi creati prima non hanno letture
 * registrate, quindi per loro l'indicatore non viene mostrato.
 */
export const SOGLIA_CONFERME_LETTURA = "2026-10-17T09:13:00Z";

export type LetturaMessaggio = { destinatari: number; letti: number };

export const haConfermeLettura = (createdAt: string) =>
  new Date(createdAt).getTime() >= Date.parse(SOGLIA_CONFERME_LETTURA);

const TZ = "Europe/Rome";
const fmtDataOra = (v: string) =>
  new Date(v).toLocaleString("it-IT", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
const giornoRoma = (d: Date) =>
  d.toLocaleDateString("it-IT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

/** Piede bolla: "HH:MM" se oggi (Europe/Rome), altrimenti "GG/MM HH:MM". */
export function formatOraMessaggio(v: string) {
  const d = new Date(v);
  const ora = d.toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (giornoRoma(d) === giornoRoma(new Date())) return ora;
  const gg = d.toLocaleDateString("it-IT", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  return `${gg} ${ora}`;
}

/** Spunte stile WhatsApp: solo icone, con aria-label. */
export function SpunteLettura({ lettura }: { lettura: LetturaMessaggio }) {
  const { destinatari, letti } = lettura;
  if (destinatari <= 0) return null;
  const tutti = letti >= destinatari;
  const label =
    letti === 0
      ? "Inviato, non ancora letto"
      : tutti
        ? "Letto da tutti"
        : `Letto da ${letti} di ${destinatari}`;
  const Icona = letti === 0 ? Check : CheckCheck;
  // Su bolla bg-blue-400: blu scuro (blue-900) ≈ 6:1 di contrasto; grigio = bianco attenuato.
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex items-center">
      <Icona className={`size-3.5 shrink-0 ${tutti ? "text-blue-900" : "text-white/70"}`} strokeWidth={2.5} />
    </span>
  );
}

const nome = (r: { nome: string | null; cognome: string | null }) =>
  `${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "—";

function ElencoLetture({ messaggioId, diretto }: { messaggioId: string; diretto: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["chat", "letture-messaggio", messaggioId],
    refetchInterval: 20_000,
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
  if (diretto && righe.length === 1) {
    const r = righe[0];
    return (
      <div className="text-sm break-words">
        {r.letto_at ? (
          <><span className="font-semibold">Letto</span> {fmtDataOra(r.letto_at)}</>
        ) : (
          <span className="text-muted-foreground">Non ancora letto</span>
        )}
      </div>
    );
  }
  const letti = righe
    .filter((r) => r.letto_at)
    .sort((a, b) => Date.parse(a.letto_at!) - Date.parse(b.letto_at!));
  const nonLetti = righe.filter((r) => !r.letto_at);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-semibold mb-1">Letto da ({letti.length})</div>
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

function Contenitore({
  open, onOpenChange, titolo, children,
}: { open: boolean; onOpenChange: (v: boolean) => void; titolo: string; children: ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader><SheetTitle>{titolo}</SheetTitle></SheetHeader>
          <div className="px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{titolo}</DialogTitle></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export type MessaggioInfo = {
  id: string;
  testo: string;
  created_at: string;
  nomeAllegato?: string | null;
};

/** "Info messaggio" per i propri messaggi (Sheet su telefono, Dialog su desktop). */
export function InfoMessaggio({
  messaggio, lettura, puoEliminare, onElimina, onOpenChange,
}: {
  messaggio: MessaggioInfo | null;
  lettura?: LetturaMessaggio;
  puoEliminare: boolean;
  onElimina: () => void;
  onOpenChange: (v: boolean) => void;
}) {
  const open = !!messaggio;
  const conConferme = messaggio ? haConfermeLettura(messaggio.created_at) : false;
  const diretto = lettura?.destinatari === 1;
  return (
    <Contenitore open={open} onOpenChange={onOpenChange} titolo="Info messaggio">
      {messaggio && (
        <div className="space-y-4 min-w-0">
          <div className="rounded-md bg-muted px-3 py-2 text-sm min-w-0">
            {messaggio.testo && (
              <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-4">
                {messaggio.testo}
              </div>
            )}
            {messaggio.nomeAllegato && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                <FileText className="size-3.5 shrink-0" />
                <span className="break-all line-clamp-2">{messaggio.nomeAllegato}</span>
              </div>
            )}
          </div>
          <div className="text-sm">
            <span className="font-semibold">Inviato</span> {fmtDataOra(messaggio.created_at)}
          </div>
          {conConferme ? (
            <div className="max-h-[40vh] overflow-y-auto">
              <ElencoLetture messaggioId={messaggio.id} diretto={diretto} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Conferme di lettura non disponibili per i messaggi precedenti al 17/10/2026
            </div>
          )}
          {puoEliminare && (
            <Button variant="destructive" className="w-full sm:w-auto" onClick={onElimina}>
              <Trash2 className="size-4" />Elimina messaggio
            </Button>
          )}
        </div>
      )}
    </Contenitore>
  );
}

/** Messaggi altrui per amministratore: solo "Elimina messaggio". */
export function AzioniMessaggioAdmin({
  open, onOpenChange, onElimina,
}: { open: boolean; onOpenChange: (v: boolean) => void; onElimina: () => void }) {
  return (
    <Contenitore open={open} onOpenChange={onOpenChange} titolo="Messaggio">
      <Button variant="destructive" className="w-full sm:w-auto" onClick={onElimina}>
        <Trash2 className="size-4" />Elimina messaggio
      </Button>
    </Contenitore>
  );
}
