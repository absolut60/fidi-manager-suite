import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileCheck2, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { getContattoPerFirma, firmaPrivacyConToken } from "@/lib/firma-privacy.functions";

export const Route = createFileRoute("/firma-privacy/$token")({
  component: FirmaPrivacyPage,
});

function FirmaPrivacyPage() {
  const { token } = Route.useParams();
  const getCt = useServerFn(getContattoPerFirma);
  const submitFn = useServerFn(firmaPrivacyConToken);

  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["firma-privacy", token],
    queryFn: () => getCt({ data: { token } }),
    retry: false,
  });
  const cliente = data?.cliente;
  const contatto = data?.contatto;

  const submit = useMutation({
    mutationFn: async () => {
      if (!padRef.current) throw new Error("Firma mancante");
      const dataUrl = getCanvasDataURL(padRef.current);
      if (!dataUrl) throw new Error("Inserisci la firma");
      await submitFn({ data: { token, firmaDataUrl: dataUrl } });
    },
    onSuccess: () => {
      setDone(true);
      toast.success("Firma registrata correttamente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="size-6 text-primary" />
          </div>
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

            <Card className="p-6 space-y-3 text-sm">
              <h3 className="font-semibold">Informativa sintetica</h3>
              <p className="text-muted-foreground">
                I dati personali raccolti saranno trattati dal Titolare per la gestione del rapporto commerciale, degli adempimenti contabili e fiscali e per finalità connesse all'esecuzione del contratto. Il conferimento è obbligatorio per le finalità contrattuali; il rifiuto comporta l'impossibilità di dare seguito al rapporto.
              </p>
              <p className="text-muted-foreground">
                I dati saranno conservati per il tempo necessario all'adempimento degli obblighi di legge. È possibile esercitare in qualsiasi momento i diritti previsti dagli artt. 15-22 del Reg. UE 2016/679 (accesso, rettifica, cancellazione, limitazione, opposizione).
              </p>
            </Card>

            <Card className="p-6 space-y-3">
              <p className="text-sm font-medium">Firma qui sotto per esprimere il consenso:</p>
              <div ref={padRef}>
                <SignaturePad onChange={(empty) => setHasSig(!empty)} />
              </div>
              <Button
                onClick={() => submit.mutate()}
                disabled={!hasSig || submit.isPending}
                className="w-full gap-1.5"
                size="lg"
              >
                <FileCheck2 className="size-4" />
                {submit.isPending ? "Invio in corso..." : "Conferma e firma"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Cliccando "Conferma e firma" il consenso verrà registrato con data e ora.
              </p>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
