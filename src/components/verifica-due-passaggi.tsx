import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AttivazioneTotp, CampoCodice } from "@/components/attivazione-totp";
import {
  MESSAGGIO_CODICE_NON_VALIDO,
  fattoreTotpVerificato,
  obbligatorio,
  rimuoviFattoriNonVerificati,
  verificaCodice,
} from "@/lib/secondo-fattore";

type Fase = "carico" | "spenta" | "attivazione" | "attiva" | "disattivazione";

export function VerificaDuePassaggi() {
  const { roles } = useAuth();
  const eObbligatoria = obbligatorio(roles);
  const [fase, setFase] = useState<Fase>("carico");
  const [fattoreId, setFattoreId] = useState<string | null>(null);
  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(false);

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
  }, []);

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
            <Button onClick={() => setFase("attivazione")} className="w-full sm:w-auto">
              Attiva
            </Button>
          </>
        )}

        {fase === "attivazione" && (
          <AttivazioneTotp
            intro={
              <p className="text-sm break-words">
                Installa sul telefono un'app di autenticazione (Google Authenticator, Microsoft Authenticator o l'app
                Password dell'iPhone), inquadra il codice e inserisci qui le 6 cifre che vedi.
              </p>
            }
            onAttivata={ricarica}
            onAnnulla={() => void ricarica()}
          />
        )}

        {fase === "attiva" && (
          <>
            <p className="text-sm">
              Stato: <span className="font-medium">attiva</span>
            </p>
            {eObbligatoria ? (
              <p className="text-sm text-muted-foreground">Obbligatoria per gli amministratori</p>
            ) : (
              <Button variant="outline" onClick={() => { setCodice(""); setFase("disattivazione"); }} className="w-full sm:w-auto">
                Disattiva
              </Button>
            )}
          </>
        )}

        {fase === "disattivazione" && !eObbligatoria && (
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
