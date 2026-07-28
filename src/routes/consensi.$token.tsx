import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileCheck2, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { CONSENSO_TESTI, CONSENSO_LABEL, INFORMATIVA_FULL, type TipoConsenso } from "@/lib/consensi-testi";
import { getContattoPerConsensi, salvaConsensiMarketing } from "@/lib/consensi-marketing.functions";

export const Route = createFileRoute("/consensi/$token")({
  component: ConsensiPage,
  head: () => ({
    meta: [
      { title: "Consensi privacy — MADE Distribuzione" },
      { name: "description", content: "Raccolta consensi marketing e profilazione ai sensi del Reg. UE 2016/679." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type ConsensoVal = "" | "si" | "no";
type Stato = Record<TipoConsenso, ConsensoVal>;

const TIPI: TipoConsenso[] = ["profilazione", "marketing_media", "marketing_diretto"];
const TESTO: Record<TipoConsenso, string> = {
  profilazione: CONSENSO_TESTI.profilazione,
  marketing_media: CONSENSO_TESTI.media,
  marketing_diretto: CONSENSO_TESTI.diretto,
};

function ConsensiPage() {
  const { token } = Route.useParams();
  const getCt = useServerFn(getContattoPerConsensi);
  const submitFn = useServerFn(salvaConsensiMarketing);

  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [done, setDone] = useState(false);
  const [nomeDichiarato, setNomeDichiarato] = useState("");
  const [scelte, setScelte] = useState<Stato>({
    profilazione: "",
    marketing_media: "",
    marketing_diretto: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["consensi-marketing", token],
    queryFn: () => getCt({ data: { token } }),
    retry: false,
  });
  const cliente = data?.cliente;
  const contatto = data?.contatto;

  const allChosen = TIPI.every((k) => scelte[k] !== "");
  const nomeOk = nomeDichiarato.trim().length >= 2;
  const canSubmit = allChosen && nomeOk && hasSig;

  const submit = useMutation({
    mutationFn: async () => {
      if (!padRef.current) throw new Error("Firma mancante");
      const firmaDataUrl = getCanvasDataURL(padRef.current);
      if (!firmaDataUrl) throw new Error("Inserisci la firma");
      await submitFn({
        data: {
          token,
          firmaDataUrl,
          firmaNomeDichiarato: nomeDichiarato.trim(),
          consensi: {
            profilazione: scelte.profilazione === "si",
            marketing_media: scelte.marketing_media === "si",
            marketing_diretto: scelte.marketing_diretto === "si",
          },
        },
      });
    },
    onSuccess: () => {
      setDone(true);
      toast.success("Consensi registrati correttamente");
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
          <h1 className="text-2xl font-bold tracking-tight">Consensi privacy — Marketing</h1>
          <p className="text-sm text-muted-foreground mt-1">Reg. UE 2016/679 (GDPR)</p>
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
        ) : done ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="size-12 text-success mx-auto mb-3" />
            <h2 className="text-lg font-semibold">Grazie!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              I tuoi consensi sono stati registrati. Puoi chiudere questa pagina.
            </p>
          </Card>
        ) : cliente && contatto ? (
          <>
            <Card className="p-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Consensi riferiti a
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
                  Firmatario
                </p>
                <p className="text-sm">
                  {[contatto.nome, contatto.cognome].filter(Boolean).join(" ")}
                </p>
                {contatto.email && (
                  <p className="text-xs text-muted-foreground">{contatto.email}</p>
                )}
              </div>
            </Card>

            <Card className="p-6 space-y-2">
              <h3 className="font-semibold text-sm">Informativa completa</h3>
              <div className="text-xs text-muted-foreground whitespace-pre-line max-h-64 overflow-y-auto border rounded p-3 bg-muted/20 leading-relaxed">
                {INFORMATIVA_FULL}
              </div>
            </Card>

            <Card className="p-6 space-y-5">
              <h3 className="font-semibold text-sm">
                Esprimi il tuo consenso per ciascuna finalità
              </h3>
              {TIPI.map((k) => (
                <div key={k} className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
                  <p className="text-sm font-medium">{CONSENSO_LABEL[k]}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{TESTO[k]}</p>
                  <div className="flex gap-3 pt-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={k}
                        checked={scelte[k] === "si"}
                        onChange={() => setScelte((s) => ({ ...s, [k]: "si" }))}
                      />
                      Fornisco il consenso
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={k}
                        checked={scelte[k] === "no"}
                        onChange={() => setScelte((s) => ({ ...s, [k]: "no" }))}
                      />
                      Nego il consenso
                    </label>
                  </div>
                </div>
              ))}
            </Card>

            <Card className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome-dichiarato" className="text-sm font-medium">
                  Nome e cognome (digitare in chiaro) *
                </Label>
                <Input
                  id="nome-dichiarato"
                  value={nomeDichiarato}
                  onChange={(e) => setNomeDichiarato(e.target.value)}
                  placeholder="Es. Mario Rossi"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Firma qui sotto *</p>
                <div ref={padRef}>
                  <SignaturePad onChange={(empty) => setHasSig(!empty)} />
                </div>
              </div>
              <Button
                onClick={() => submit.mutate()}
                disabled={!canSubmit || submit.isPending}
                className="w-full gap-1.5"
                size="lg"
              >
                <FileCheck2 className="size-4" />
                {submit.isPending ? "Invio in corso..." : "Conferma consensi"}
              </Button>
              {!canSubmit && (
                <p className="text-xs text-muted-foreground text-center">
                  Per procedere: scegli una risposta per ogni consenso, digita nome e cognome, e apponi la firma.
                </p>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
