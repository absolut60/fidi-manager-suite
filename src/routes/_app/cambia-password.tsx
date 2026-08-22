import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (pwd.length < 8) {
      setErrore("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (pwd !== pwd2) {
      setErrore("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw new Error(error.message);
      if (user?.id) {
        const { error: eProf } = await supabase
          .from("profili")
          .update({ deve_cambiare_password: false })
          .eq("id", user.id);
        if (eProf) throw new Error(eProf.message);
      }
      toast.success("Password aggiornata correttamente.");
      navigate({ to: "/attiva-notifiche" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore imprevisto";
      setErrore(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <Card>
        <CardHeader>
          <CardTitle>Imposta la tua password</CardTitle>
          <CardDescription>
            Per la tua sicurezza, scegli una nuova password prima di continuare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pwd">Nuova password</Label>
              <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd2">Conferma password</Label>
              <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </div>
            {errore && <p className="text-sm text-destructive">{errore}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Salvataggio..." : "Salva e continua"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
