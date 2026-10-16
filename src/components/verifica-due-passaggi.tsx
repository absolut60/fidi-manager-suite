import { useEffect, useRef, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  MESSAGGIO_CODICE_NON_VALIDO,
  fattoreTotpVerificato,
  rimuoviFattoriNonVerificati,
  srcQr,
  verificaCodice,
} from "@/lib/secondo-fattore";

type Fase = "carico" | "spenta" | "attivazione" | "attiva" | "disattivazione";

function CampoCodice({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
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

export function VerificaDuePassaggi() {
  const [fase, setFase] = useState<Fase>("carico");
  const [fattoreId, setFattoreId] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [segreto, setSegreto] = useState("");
  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(false);
  const inAttivazione = useRef<string | null>(null);

  async function ricarica() {
    try {
      await rimuoviFattoriNonVerificati();
      const id = await fattoreTotpVerificato();
      setFattoreId(id);
      setFase(id ? "attiva" : "spenta");
    } catch {
      setFase("spenta");
      toast.error("Impossibile leggere lo stato della verifica in due passaggi");
    }
  }

  useEffect(() => {
    void ricarica();
    return () => {
      // Uscita dalla pagina a metà attivazione: nessun residuo.
      const id = inAttivazione.current;
      if (id) void supabase.auth.mfa.unenroll({ factorId: id });
    };
  }, []);

  async function avvia() {
    setBusy(true);
    try {
      await rimuoviFattoriNonVerificati();
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "FidiManager" });
      if (error) throw error;
      inAttivazione.current = data.id;
      setFattoreId(data.id);
      setQr(srcQr(data.totp.qr_code));
      setSegreto(data.totp.secret);
      setCodice("");
      setFase("attivazione");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attivazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function annullaAttivazione() {
    setBusy(true);
    const id = inAttivazione.current;
    inAttivazione.current = null;
    if (id) await supabase.auth.mfa.unenroll({ factorId: id });
    setQr("");
    setSegreto("");
    setCodice("");
    setBusy(false);
    await ricarica();
  }

  async function confermaAttivazione() {
    if (!fattoreId || codice.length !== 6) return;
    setBusy(true);
    try {
      await verificaCodice(fattoreId, codice);
      inAttivazione.current = null;
      setQr("");
      setSegreto("");
      setCodice("");
      setFase("attiva");
      toast.success("Verifica in due passaggi attiva");
    } catch {
      toast.error(MESSAGGIO_CODICE_NON_VALIDO);
    } finally {
      setBusy(false);
    }
  }

  async function confermaDisattivazione() {
    if (!fattoreId || codice.length !== 6) return;
    setBusy(true);
    try {
      await verificaCodice(fattoreId, codice);
    } catch {
      toast.error(MESSAGGIO_CODICE_NON_VALIDO);
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fattoreId });
    setBusy(false);
    setCodice("");
    if (error) {
      toast.error("Disattivazione non riuscita");
      return;
    }
    await supabase.auth.refreshSession();
    toast.success("Verifica in due passaggi disattivata");
    await ricarica();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" />
          Verifica in due passaggi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fase === "carico" && <p className="text-sm text-muted-foreground">Caricamento...</p>}

        {fase === "spenta" && (
          <>
            <p className="text-sm">
              Stato: <span className="font-medium">non attiva</span>
            </p>
            <p className="text-sm text-muted-foreground">
              All'accesso, oltre alla password, ti verrà chiesto un codice dall'app di autenticazione del telefono.
            </p>
            <Button onClick={avvia} disabled={busy} className="w-full sm:w-auto">
              Attiva
            </Button>
          </>
        )}

        {fase === "attivazione" && (
          <>
            <p className="text-sm break-words">
              Installa sul telefono un'app di autenticazione (Google Authenticator, Microsoft Authenticator o l'app
              Password dell'iPhone), inquadra il codice e inserisci qui le 6 cifre che vedi.
            </p>
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
            <div className="space-y-1.5">
              <Label htmlFor="codice-attivazione">Codice a 6 cifre</Label>
              <CampoCodice id="codice-attivazione" value={codice} onChange={setCodice} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={confermaAttivazione} disabled={busy || codice.length !== 6} className="w-full sm:w-auto">
                Conferma
              </Button>
              <Button variant="outline" onClick={annullaAttivazione} disabled={busy} className="w-full sm:w-auto">
                Annulla
              </Button>
            </div>
          </>
        )}

        {fase === "attiva" && (
          <>
            <p className="text-sm">
              Stato: <span className="font-medium">attiva</span>
            </p>
            <Button variant="outline" onClick={() => { setCodice(""); setFase("disattivazione"); }} className="w-full sm:w-auto">
              Disattiva
            </Button>
          </>
        )}

        {fase === "disattivazione" && (
          <>
            <p className="text-sm">Per disattivare, inserisci il codice a 6 cifre dell'app di autenticazione.</p>
            <div className="space-y-1.5">
              <Label htmlFor="codice-disattivazione">Codice a 6 cifre</Label>
              <CampoCodice id="codice-disattivazione" value={codice} onChange={setCodice} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="destructive" onClick={confermaDisattivazione} disabled={busy || codice.length !== 6} className="w-full sm:w-auto">
                Disattiva
              </Button>
              <Button variant="outline" onClick={() => { setCodice(""); setFase("attiva"); }} disabled={busy} className="w-full sm:w-auto">
                Annulla
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
