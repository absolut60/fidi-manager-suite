import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileCheck2, AlertCircle, ShieldCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { getContattoPerFirma, firmaPrivacyConToken } from "@/lib/firma-privacy.functions";
import { INFORMATIVA_FULL, CONSENSO_TESTI } from "@/lib/consensi-testi";

export const Route = createFileRoute("/firma-privacy/$token")({
  component: FirmaPrivacyPage,
});

type ConsensoVal = "" | "si" | "no";

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emailValida(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function FirmaPrivacyPage() {
  const { token } = Route.useParams();
  const getCt = useServerFn(getContattoPerFirma);
  const submitFn = useServerFn(firmaPrivacyConToken);

  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [done, setDone] = useState(false);
  const [emailInviata, setEmailInviata] = useState(false);

  const [dich, setDich] = useState({
    nome: "",
    cognome: "",
    societa: "",
    luogo_nascita: "",
    data_nascita: "",
    codice_fiscale: "",
    residenza: "",
    email: "",
    cellulare: "",
    data_firma: oggiIso(),
  });
  const [consensi, setConsensi] = useState<{
    profilazione: ConsensoVal;
    marketing_media: ConsensoVal;
    marketing_diretto: ConsensoVal;
  }>({ profilazione: "", marketing_media: "", marketing_diretto: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["firma-privacy", token],
    queryFn: () => getCt({ data: { token } }),
    retry: false,
  });
  const cliente = data?.cliente;
  const contatto = data?.contatto;

  // Precompilazione dai dati già presenti sul contatto
  useEffect(() => {
    if (!data) return;
    setDich((d) => ({
      ...d,
      nome: d.nome || data.contatto.nome || "",
      cognome: d.cognome || data.contatto.cognome || "",
      societa: d.societa || data.cliente.ragione_sociale || "",
      luogo_nascita: d.luogo_nascita || data.contatto.luogo_nascita || "",
      data_nascita: d.data_nascita || data.contatto.data_nascita || "",
      codice_fiscale: d.codice_fiscale || data.contatto.codice_fiscale || "",
      residenza: d.residenza || data.contatto.residenza || "",
      email: d.email || data.contatto.email || "",
      cellulare: d.cellulare || data.contatto.cellulare || "",
    }));
  }, [data]);

  const setD = (k: keyof typeof dich, v: string) => setDich((d) => ({ ...d, [k]: v }));

  const consensiCompleti =
    consensi.profilazione !== "" &&
    consensi.marketing_media !== "" &&
    consensi.marketing_diretto !== "";
  const emailOk = emailValida(dich.email);
  const anagraficaOk = dich.nome.trim().length > 0 && dich.cognome.trim().length > 0;
  const canSubmit = hasSig && emailOk && anagraficaOk && consensiCompleti;

  const submit = useMutation({
    mutationFn: async () => {
      if (!padRef.current) throw new Error("Firma mancante");
      const dataUrl = getCanvasDataURL(padRef.current);
      if (!dataUrl) throw new Error("Inserisci la firma");
      return await submitFn({
        data: {
          token,
          firmaDataUrl: dataUrl,
          dichiarante: {
            nome: dich.nome.trim(),
            cognome: dich.cognome.trim(),
            societa: dich.societa.trim() || undefined,
            luogo_nascita: dich.luogo_nascita.trim() || undefined,
            data_nascita: dich.data_nascita || undefined,
            codice_fiscale: dich.codice_fiscale.trim() || undefined,
            residenza: dich.residenza.trim() || undefined,
            email: dich.email.trim(),
            cellulare: dich.cellulare.trim() || undefined,
          },
          consensi: {
            profilazione: consensi.profilazione === "si",
            marketing_media: consensi.marketing_media === "si",
            marketing_diretto: consensi.marketing_diretto === "si",
          },
          data_firma: dich.data_firma || undefined,
        },
      });
    },
    onSuccess: (res) => {
      setEmailInviata(Boolean(res?.emailInviata));
      setDone(true);
      toast.success("Firma registrata correttamente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ConsensoBlock = ({
    k,
    testo,
  }: {
    k: "profilazione" | "marketing_media" | "marketing_diretto";
    testo: string;
  }) => (
    <div className="rounded-md border p-3 space-y-2">
      <p className="leading-relaxed" style={{ fontSize: "11px" }}>{testo}</p>
      <RadioGroup
        value={consensi[k]}
        onValueChange={(v) => setConsensi((c) => ({ ...c, [k]: v as ConsensoVal }))}
        className="flex flex-col gap-1.5"
      >
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="si" /> fornisce il consenso
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="no" /> nega il consenso
        </label>
      </RadioGroup>
    </div>
  );

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
            {emailInviata ? (
              <p className="text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                <Mail className="size-4" />
                Una copia del contratto firmato è stata inviata a <strong>{dich.email}</strong>.
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

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-sm">Dati del Dichiarante</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input value={dich.nome} onChange={(e) => setD("nome", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cognome *</Label>
                  <Input value={dich.cognome} onChange={(e) => setD("cognome", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Società / Ente rappresentato</Label>
                <Input
                  value={dich.societa}
                  onChange={(e) => setD("societa", e.target.value)}
                  placeholder={cliente.ragione_sociale}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Luogo di nascita</Label>
                  <Input value={dich.luogo_nascita} onChange={(e) => setD("luogo_nascita", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data di nascita</Label>
                  <Input type="date" value={dich.data_nascita} onChange={(e) => setD("data_nascita", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Codice fiscale</Label>
                  <Input
                    value={dich.codice_fiscale}
                    onChange={(e) => setD("codice_fiscale", e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Residenza</Label>
                  <Input
                    value={dich.residenza}
                    onChange={(e) => setD("residenza", e.target.value)}
                    placeholder="Via, n°, CAP, Città (Prov.)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>E-mail *</Label>
                  <Input type="email" value={dich.email} onChange={(e) => setD("email", e.target.value)} />
                  {!emailOk && (
                    <p className="text-xs text-destructive">
                      L'email è necessaria per ricevere il contratto firmato
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Cellulare</Label>
                  <Input value={dich.cellulare} onChange={(e) => setD("cellulare", e.target.value)} />
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-3">
              <h3 className="font-semibold text-sm">Informativa privacy estesa</h3>
              <div
                className="rounded-md border bg-muted/40 p-3 overflow-y-auto whitespace-pre-line leading-relaxed"
                style={{ height: "250px", fontSize: "11px" }}
              >
                {INFORMATIVA_FULL}
              </div>

              <p className="font-bold leading-relaxed" style={{ fontSize: "12px" }}>
                Il sottoscritto, avendo letto l'informativa fornita dal titolare del trattamento ai sensi dell'art. 13 GDPR sul trattamento e sulla comunicazione dei dati personali (comuni, sensibili) da questo effettuati, con le finalita' connesse all'adempimento del rapporto contrattuale e ai connessi adempimenti di legge, essendo consapevole che in mancanza di consenso ai predetti trattamenti il titolare non potra' - da un lato - assolvere gli obblighi di legge e quindi costituire o proseguire il rapporto contrattuale e - dall'altro - di svolgere la propria attivita' tipica,
              </p>

              <div className="space-y-3">
                <ConsensoBlock k="profilazione" testo={CONSENSO_TESTI.profilazione} />
                <ConsensoBlock k="marketing_media" testo={CONSENSO_TESTI.media} />
                <ConsensoBlock k="marketing_diretto" testo={CONSENSO_TESTI.diretto} />
              </div>
              {!consensiCompleti && (
                <p className="text-xs text-destructive">
                  Esprimi una scelta per tutti e tre i consensi.
                </p>
              )}
            </Card>

            <Card className="p-6 space-y-3">
              <div className="space-y-1.5 max-w-xs">
                <Label>Data firma</Label>
                <Input type="date" value={dich.data_firma} onChange={(e) => setD("data_firma", e.target.value)} />
              </div>
              <p className="text-sm font-medium">Firma qui sotto per esprimere il consenso:</p>
              <div ref={padRef}>
                <SignaturePad onChange={(empty) => setHasSig(!empty)} />
              </div>
              <Button
                onClick={() => submit.mutate()}
                disabled={!canSubmit || submit.isPending}
                className="w-full gap-1.5"
                size="lg"
              >
                <FileCheck2 className="size-4" />
                {submit.isPending ? "Invio in corso..." : "Conferma e firma"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Cliccando "Conferma e firma" il consenso verrà registrato con data e ora e riceverai
                copia del contratto all'indirizzo email indicato.
              </p>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
