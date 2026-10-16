// Parti comuni dell'attivazione TOTP (FM44): usate da Il mio profilo e da /attiva-verifica.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  MESSAGGIO_CODICE_NON_VALIDO,
  rimuoviFattoriNonVerificati,
  srcQr,
  verificaCodice,
} from "@/lib/secondo-fattore";

export function CampoCodice({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="123456"
      className="h-11 max-w-[12rem] text-center text-lg tracking-widest"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    />
  );
}

/**
 * Avvia subito l'attivazione (enroll) al montaggio, mostra QR + codice segreto
 * e conferma con 6 cifre. Smontato a metà: il fattore non verificato viene rimosso.
 */
export function AttivazioneTotp({
  onAttivata,
  onAnnulla,
  intro,
  passoQr,
  passoCodice,
}: {
  onAttivata: () => void | Promise<void>;
  onAnnulla?: () => void;
  intro?: ReactNode;
  passoQr?: ReactNode;
  passoCodice?: ReactNode;
}) {
  const [fattoreId, setFattoreId] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [segreto, setSegreto] = useState("");
  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const inAttivazione = useRef<string | null>(null);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        await rimuoviFattoriNonVerificati();
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "FidiManager" });
        if (error) throw error;
        if (annullato) {
          void supabase.auth.mfa.unenroll({ factorId: data.id });
          return;
        }
        inAttivazione.current = data.id;
        setFattoreId(data.id);
        setQr(srcQr(data.totp.qr_code));
        setSegreto(data.totp.secret);
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : "Attivazione non riuscita");
      } finally {
        if (!annullato) setBusy(false);
      }
    })();
    return () => {
      annullato = true;
      const id = inAttivazione.current;
      if (id) void supabase.auth.mfa.unenroll({ factorId: id });
    };
  }, []);

  async function conferma() {
    if (!fattoreId || codice.length !== 6) return;
    setBusy(true);
    try {
      await verificaCodice(fattoreId, codice);
      inAttivazione.current = null;
      toast.success("Verifica in due passaggi attiva");
      await onAttivata();
    } catch {
      toast.error(MESSAGGIO_CODICE_NON_VALIDO);
      setCodice("");
    } finally {
      setBusy(false);
    }
  }

  if (errore) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive break-words">Attivazione non riuscita: {errore}</p>
        {onAnnulla && (
          <Button variant="outline" onClick={onAnnulla} className="w-full sm:w-auto">Indietro</Button>
        )}
      </div>
    );
  }

  if (!qr) return <p className="text-sm text-muted-foreground">Caricamento...</p>;

  return (
    <div className="space-y-4">
      {intro}
      {passoQr}
      <div className="flex justify-center sm:justify-start">
        <img src={qr} alt="Codice QR per l'app di autenticazione" className="size-48 rounded-md border bg-background p-2" />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Non riesci a inquadrare? Inserisci questo codice nell'app:</p>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-sm">{segreto}</code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0"
            aria-label="Copia codice"
            onClick={() => navigator.clipboard.writeText(segreto).then(() => toast.success("Codice copiato"))}
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
      {passoCodice}
      <div className="space-y-1.5">
        <Label htmlFor="codice-attivazione">Codice a 6 cifre</Label>
        <CampoCodice id="codice-attivazione" value={codice} onChange={setCodice} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={conferma} disabled={busy || codice.length !== 6} className="w-full sm:w-auto min-h-10">
          Conferma
        </Button>
        {onAnnulla && (
          <Button variant="outline" onClick={onAnnulla} disabled={busy} className="w-full sm:w-auto min-h-10">
            Annulla
          </Button>
        )}
      </div>
    </div>
  );
}
