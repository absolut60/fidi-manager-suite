import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";
import {
  MESSAGGIO_CODICE_NON_VALIDO,
  fattoreTotpVerificato,
  serveCodice,
  statoSecondoFattore,
  verificaCodice,
} from "@/lib/secondo-fattore";

function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export const Route = createFileRoute("/verifica-codice")({
  validateSearch: zodValidator(z.object({ next: fallback(z.string().optional(), undefined) })),
  head: () => ({
    meta: [
      { title: "Verifica codice · FidiManager" },
      { name: "description", content: "Inserisci il codice dell'app di autenticazione per accedere a FidiManager." },
      { property: "og:title", content: "Verifica codice · FidiManager" },
      { property: "og:description", content: "Secondo passaggio di accesso a FidiManager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificaCodicePage,
});

function VerificaCodicePage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/verifica-codice" });
  const target = safeNext(next);
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/login", replace: true });
        return;
      }
      try {
        if (!serveCodice(await statoSecondoFattore())) window.location.href = target;
      } catch {
        /* resta sulla pagina */
      }
    })();
  }, [navigate, target]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (codice.length !== 6) return;
    setBusy(true);
    setErrore(null);
    try {
      const id = await fattoreTotpVerificato();
      if (!id) throw new Error("nessun fattore");
      await verificaCodice(id, codice);
      window.location.href = target;
    } catch {
      setErrore(MESSAGGIO_CODICE_NON_VALIDO);
      setCodice("");
      setBusy(false);
    }
  }

  async function esci() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 px-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src={`data:image/png;base64,${LOGO_MADE_BASE64}`}
            alt="MADE"
            className="h-auto w-48 mb-3"
            style={{ aspectRatio: "490 / 69" }}
          />
          <p className="text-sm text-muted-foreground">FidiManager · Gruppo MADE</p>
        </div>
        <form onSubmit={invia} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="codice">Inserisci il codice a 6 cifre dell'app di autenticazione</Label>
            <Input
              id="codice"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              className="h-11 text-center text-lg tracking-widest"
              value={codice}
              onChange={(e) => setCodice(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {errore && (
            <p role="alert" className="text-sm text-destructive">
              {errore}
            </p>
          )}
          <Button type="submit" className="w-full h-11" disabled={busy || codice.length !== 6}>
            {busy ? "Attendere..." : "Verifica"}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <Button variant="link" onClick={esci} className="h-10">
            Esci
          </Button>
        </div>
      </Card>
    </div>
  );
}
