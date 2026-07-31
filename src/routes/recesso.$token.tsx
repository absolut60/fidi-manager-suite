import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CONSENSO_LABEL, CONSENSO_TESTI, type TipoConsenso } from "@/lib/consensi-testi";
import { getContattoPerRecesso, revocaConsensi } from "@/lib/recesso-consensi.functions";

export const Route = createFileRoute("/recesso/$token")({
  component: RecessoPage,
  head: () => ({
    meta: [
      { title: "Preferenze di comunicazione — MADE Distribuzione" },
      {
        name: "description",
        content: "Revoca i consensi marketing ai sensi dell'art. 7 Reg. UE 2016/679.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const TIPI: TipoConsenso[] = ["marketing_diretto", "marketing_media", "profilazione"];
const TESTO: Record<TipoConsenso, string> = {
  profilazione: CONSENSO_TESTI.profilazione,
  marketing_media: CONSENSO_TESTI.media,
  marketing_diretto: CONSENSO_TESTI.diretto,
};

function RecessoPage() {
  const { token } = Route.useParams();
  const getCt = useServerFn(getContattoPerRecesso);
  const revocaFn = useServerFn(revocaConsensi);

  const [scelte, setScelte] = useState<Record<TipoConsenso, boolean>>({
    marketing_diretto: false,
    marketing_media: false,
    profilazione: false,
  });
  const [revocati, setRevocati] = useState<TipoConsenso[] | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["recesso-consensi", token],
    queryFn: () => getCt({ data: { token } }),
    retry: false,
  });
  const cliente = data?.cliente;
  const contatto = data?.contatto;
  const stato = data?.statoAttuale;

  const attivi = TIPI.filter((t) => stato?.[t]);
  const selezionati = TIPI.filter((t) => scelte[t] && stato?.[t]);

  const revoca = useMutation({
    mutationFn: async (tipi: TipoConsenso[]) => {
      await revocaFn({
        data: {
          token,
          consensiDaRevocare: {
            marketing_diretto: tipi.includes("marketing_diretto"),
            marketing_media: tipi.includes("marketing_media"),
            profilazione: tipi.includes("profilazione"),
          },
        },
      });
      return tipi;
    },
    onSuccess: (tipi) => {
      setRevocati(tipi);
      toast.success("Preferenze aggiornate");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ShieldOff className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Gestisci le tue preferenze di comunicazione
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Art. 7 Reg. UE 2016/679 (GDPR) — revoca dei consensi
          </p>
        </div>

        {isLoading ? (
          <Card className="p-6 space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </Card>
        ) : error ? (
          <Card className="p-6 text-center">
            <AlertCircle className="size-8 text-destructive mx-auto mb-2" />
            <p className="font-medium">Impossibile aprire il link</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
          </Card>
        ) : revocati ? (
          <Card className="p-8 text-center space-y-3">
            <CheckCircle2 className="size-12 text-success mx-auto" />
            <h2 className="text-lg font-semibold">Preferenze aggiornate</h2>
            <p className="text-sm text-muted-foreground">
              Abbiamo registrato la revoca dei seguenti consensi:
            </p>
            <ul className="text-sm font-medium space-y-1">
              {revocati.map((t) => (
                <li key={t}>{CONSENSO_LABEL[t]}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Puoi chiudere questa pagina.</p>
          </Card>
        ) : cliente && contatto && stato ? (
          <>
            <Card className="p-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preferenze riferite a
              </p>
              <p className="text-lg font-semibold">{cliente.ragione_sociale}</p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {cliente.partita_iva && <p>P.IVA {cliente.partita_iva}</p>}
                {cliente.indirizzo && (
                  <p>
                    {cliente.indirizzo}
                    {cliente.citta ? `, ${cliente.citta}` : ""}
                  </p>
                )}
              </div>
              <div className="pt-2 border-t mt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Interessato
                </p>
                <p className="text-sm">
                  {[contatto.nome, contatto.cognome].filter(Boolean).join(" ")}
                </p>
                {contatto.email && (
                  <p className="text-xs text-muted-foreground">{contatto.email}</p>
                )}
              </div>
            </Card>

            {attivi.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="size-10 text-success mx-auto mb-2" />
                <p className="font-medium">Nessun consenso attivo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Non risultano consensi marketing attivi per questo contatto.
                </p>
              </Card>
            ) : (
              <>
                <Card className="p-6 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Puoi revocare tutti i consensi con un solo clic, oppure scegliere qui sotto
                    quali revocare.
                  </p>
                  <Button
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    disabled={revoca.isPending}
                    onClick={() => revoca.mutate(attivi)}
                  >
                    Revoca tutti i consensi
                  </Button>
                </Card>

                <Card className="p-6 space-y-5">
                  <h3 className="font-semibold text-sm">Le tue finalità</h3>
                  {TIPI.map((t) => {
                    const attivo = !!stato[t];
                    return (
                      <div key={t} className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{CONSENSO_LABEL[t]}</p>
                          <Badge variant={attivo ? "default" : "secondary"}>
                            {attivo ? "Attivo" : "Non attivo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{TESTO[t]}</p>
                        {attivo ? (
                          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                            <Checkbox
                              checked={scelte[t]}
                              onCheckedChange={(v) =>
                                setScelte((s) => ({ ...s, [t]: v === true }))
                              }
                            />
                            Revoca questa finalità
                          </label>
                        ) : (
                          <p className="text-xs text-muted-foreground pt-1">
                            Consenso già disattivato. Per riattivarlo contatta il punto vendita.
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={selezionati.length === 0 || revoca.isPending}
                    onClick={() => revoca.mutate(selezionati)}
                  >
                    {revoca.isPending ? "Invio in corso..." : "Conferma revoca"}
                  </Button>
                  {selezionati.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Seleziona almeno una finalità da revocare.
                    </p>
                  )}
                </Card>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
