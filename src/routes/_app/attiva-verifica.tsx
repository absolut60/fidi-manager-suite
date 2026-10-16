import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttivazioneTotp } from "@/components/attivazione-totp";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";
import { LINK_APP_AUTENTICAZIONE } from "@/lib/secondo-fattore";

export const Route = createFileRoute("/_app/attiva-verifica")({
  head: () => ({
    meta: [
      { title: "Attiva la verifica in due passaggi · FidiManager" },
      { name: "description", content: "Attiva l'app di autenticazione per accedere a FidiManager come amministratore." },
      { property: "og:title", content: "Attiva la verifica in due passaggi · FidiManager" },
      { property: "og:description", content: "Percorso guidato per la verifica in due passaggi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AttivaVerificaPage,
});

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm break-words">{children}</div>
    </div>
  );
}

function AttivaVerificaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function esci() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  async function attivata() {
    // La sessione ora è aal2: ricarica a pagina piena così ogni lettura riparte col nuovo livello.
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 px-4 py-6">
      <Card className="w-full max-w-lg p-5 sm:p-8">
        <div className="mb-5 flex flex-col items-center">
          <img
            src={`data:image/png;base64,${LOGO_MADE_BASE64}`}
            alt="MADE"
            className="mb-3 h-auto w-40"
            style={{ aspectRatio: "490 / 69" }}
          />
        </div>
        <h1 className="text-xl font-semibold break-words">Attiva la verifica in due passaggi</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Per gli amministratori è obbligatoria. Ci vogliono due minuti.
        </p>
        <AttivazioneTotp
          onAttivata={attivata}
          intro={
            <Passo n={1}>
              Installa sul telefono un'app di autenticazione:{" "}
              <a href={LINK_APP_AUTENTICAZIONE.appStore} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                App Store
              </a>{" "}
              ·{" "}
              <a href={LINK_APP_AUTENTICAZIONE.googlePlay} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                Google Play
              </a>
              , oppure usa Microsoft Authenticator o l'app Password dell'iPhone.
            </Passo>
          }
          passoQr={<Passo n={2}>Apri l'app e inquadra questo codice QR.</Passo>}
          passoCodice={<Passo n={3}>Inserisci le 6 cifre che vedi nell'app.</Passo>}
        />
        <div className="mt-5 text-center">
          <Button variant="link" onClick={esci} className="h-10">
            Esci
          </Button>
        </div>
      </Card>
    </div>
  );
}
