import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuloConsensoPrivacy, type ModuloConsensoPayload } from "@/components/modulo-consenso-privacy";
import { getContattoPerFirma, firmaPrivacyConToken } from "@/lib/firma-privacy.functions";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";

export const Route = createFileRoute("/firma-privacy/$token")({
  component: FirmaPrivacyPage,
});

function FirmaPrivacyPage() {
  const { token } = Route.useParams();
  const getCt = useServerFn(getContattoPerFirma);
  const submitFn = useServerFn(firmaPrivacyConToken);

  const [done, setDone] = useState(false);
  const [emailInviata, setEmailInviata] = useState(false);
  const [emailFirmatario, setEmailFirmatario] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["firma-privacy", token],
    queryFn: () => getCt({ data: { token } }),
    retry: false,
  });
  const cliente = data?.cliente;
  const contatto = data?.contatto;

  const submit = useMutation({
    mutationFn: async (payload: ModuloConsensoPayload) => {
      setEmailFirmatario(payload.dichiarante.email);
      return await submitFn({ data: { token, ...payload } });
    },
    onSuccess: (res) => {
      setEmailInviata(Boolean(res?.emailInviata));
      setDone(true);
      toast.success("Firma registrata correttamente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <img
            src={`data:image/png;base64,${LOGO_MADE_BASE64}`}
            alt="MADE"
            className="h-12 w-auto mx-auto mb-4"
            style={{ aspectRatio: "490 / 69" }}
          />
          <h1 className="text-2xl font-bold tracking-tight">Consenso privacy</h1>
          <p className="text-sm text-muted-foreground mt-1">Reg. UE 2016/679 (GDPR) - Art. 13</p>
        </div>

        {isLoading ? (
          <Card className="p-6 space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></Card>
        ) : error ? (
          <Card className="p-6 text-center">
            <AlertCircle className="size-8 text-destructive mx-auto mb-2" />
            <p className="font-medium">Impossibile aprire il link</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
          </Card>
        ) : done ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="size-12 text-success mx-auto mb-3" />
            <h2 className="text-lg font-semibold">Grazie!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Il tuo consenso è stato registrato. Puoi chiudere questa pagina.
            </p>
            {emailInviata ? (
              <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                <Mail className="size-4" />
                Una copia del contratto firmato è stata inviata a <strong>{emailFirmatario}</strong>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-3">
                Il documento è archiviato. L'invio della copia via email non è andato a buon fine:
                puoi richiederla al punto vendita.
              </p>
            )}
          </Card>
        ) : cliente && contatto ? (
          <>
            <Card className="p-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stai firmando per</p>
              <p className="text-lg font-semibold">{cliente.ragione_sociale}</p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {cliente.partita_iva && <p>P.IVA {cliente.partita_iva}</p>}
                {cliente.indirizzo && <p>{cliente.indirizzo}{cliente.citta ? `, ${cliente.citta}` : ""}</p>}
              </div>
              <div className="pt-2 border-t mt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Firmatario</p>
                <p className="text-sm">{[contatto.nome, contatto.cognome].filter(Boolean).join(" ")}</p>
                {contatto.email && <p className="text-xs text-muted-foreground">{contatto.email}</p>}
              </div>
            </Card>

            <ModuloConsensoPrivacy
              valoriIniziali={{
                nome: contatto.nome,
                cognome: contatto.cognome,
                societa: cliente.ragione_sociale,
                luogo_nascita: contatto.luogo_nascita,
                data_nascita: contatto.data_nascita,
                codice_fiscale: contatto.codice_fiscale,
                residenza: contatto.residenza,
                email: contatto.email,
                cellulare: contatto.cellulare,
              }}
              placeholderSocieta={cliente.ragione_sociale}
              modalita="flag"
              onSubmit={(p) => submit.mutate(p)}
              isPending={submit.isPending}
              inviaLabel="Conferma e invia"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
