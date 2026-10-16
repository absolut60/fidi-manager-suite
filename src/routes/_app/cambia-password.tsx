import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfig } from "@/hooks/use-config";
import { serveAttivazione, statoSecondoFattore } from "@/lib/secondo-fattore";
import { RequisitiPassword } from "@/components/requisiti-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  messaggioErroreCambioPassword,
  passwordScaduta,
  verificaPassword,
} from "@/lib/regole-password";

export const Route = createFileRoute("/_app/cambia-password")({
  head: () => ({
    meta: [
      { title: "Imposta la tua password — FidiManager" },
      { name: "description", content: "Scegli una nuova password per accedere a FidiManager in sicurezza." },
      { property: "og:title", content: "Imposta la tua password — FidiManager" },
      { property: "og:description", content: "Scegli una nuova password per accedere a FidiManager in sicurezza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CambiaPasswordPage,
});

function CambiaPasswordPage() {
  const { user, profilo, roles, aggiornaProfilo } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const primoAccesso = profilo?.deve_cambiare_password === true;
  const scaduta = passwordScaduta(profilo, config.scadenza_password_giorni);
  const { valida } = verificaPassword(pwd);
  const coincidono = pwd.length > 0 && pwd === pwd2;
  const puoSalvare = valida && coincidono && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (!valida) {
      setErrore("La password non rispetta tutti i requisiti.");
      return;
    }
    if (!coincidono) {
      setErrore("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw new Error(messaggioErroreCambioPassword(error));
      const patch = { deve_cambiare_password: false, password_cambiata_il: new Date().toISOString() };
      if (user?.id) {
        const { error: eProf } = await supabase.from("profili").update(patch).eq("id", user.id);
        if (eProf) throw new Error(eProf.message);
      }
      // Aggiornamento ottimistico + rilettura: vince sulla rilettura scatenata da USER_UPDATED.
      await aggiornaProfilo(patch);
      toast.success("Password aggiornata correttamente.");
      navigate({ to: primoAccesso ? "/attiva-notifiche" : "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore imprevisto";
      setErrore(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle>Imposta la tua password</CardTitle>
          <CardDescription>
            {scaduta
              ? "La tua password è scaduta: scegline una nuova."
              : "Per la tua sicurezza, scegli una nuova password prima di continuare."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pwd">Nuova password</Label>
              <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <RequisitiPassword pwd={pwd} />
            <div className="space-y-2">
              <Label htmlFor="pwd2">Conferma password</Label>
              <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
              {pwd2.length > 0 && !coincidono && (
                <p className="text-xs text-destructive">Le due password non coincidono.</p>
              )}
            </div>
            {errore && <p className="text-sm text-destructive">{errore}</p>}
            <Button type="submit" disabled={!puoSalvare} className="w-full min-h-10">
              {busy ? "Salvataggio..." : "Salva e continua"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
