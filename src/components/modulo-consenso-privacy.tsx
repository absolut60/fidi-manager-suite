import { useEffect, useRef, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { INFORMATIVA_FULL, CONSENSO_TESTI } from "@/lib/consensi-testi";

export type ConsensoVal = "" | "si" | "no";

export type DichiaranteValori = {
  nome?: string | null;
  cognome?: string | null;
  societa?: string | null;
  luogo_nascita?: string | null;
  data_nascita?: string | null;
  codice_fiscale?: string | null;
  residenza?: string | null;
  email?: string | null;
  cellulare?: string | null;
};

export type ModuloConsensoPayload = {
  firmaDataUrl?: string;
  dichiarante: {
    nome: string;
    cognome: string;
    societa?: string;
    luogo_nascita?: string;
    data_nascita?: string;
    codice_fiscale?: string;
    residenza?: string;
    email: string;
    cellulare?: string;
  };
  consensi: {
    profilazione: boolean;
    marketing_media: boolean;
    marketing_diretto: boolean;
  };
  data_firma?: string;
  secondi_permanenza: number;
};

function oggiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emailValida(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/**
 * Modulo completo di raccolta consenso privacy (dati dichiarante + informativa
 * estesa + 3 consensi granulari + firma grafica).
 * §5 — Fonte unica usata sia dalla pagina pubblica /firma-privacy/$token sia
 * dal dialog "Compila di persona" sulla scheda contatto.
 */
export function ModuloConsensoPrivacy({
  valoriIniziali,
  placeholderSocieta,
  onSubmit,
  inviaLabel = "Conferma e firma",
  isPending = false,
  notaFinale,
  modalita = "firma",
}: {
  valoriIniziali?: DichiaranteValori;
  placeholderSocieta?: string;
  onSubmit: (payload: ModuloConsensoPayload) => void;
  inviaLabel?: string;
  isPending?: boolean;
  notaFinale?: string;
  /** "firma" = firma grafica (tablet). "flag" = conferma telematica (link pubblico). */
  modalita?: "firma" | "flag";
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const apertaAlRef = useRef<number>(Date.now());
  const [hasSig, setHasSig] = useState(false);
  const [flagConfermato, setFlagConfermato] = useState(false);

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

  // Precompilazione dai dati già presenti sul soggetto
  useEffect(() => {
    if (!valoriIniziali) return;
    setDich((d) => ({
      ...d,
      nome: d.nome || valoriIniziali.nome || "",
      cognome: d.cognome || valoriIniziali.cognome || "",
      societa: d.societa || valoriIniziali.societa || "",
      luogo_nascita: d.luogo_nascita || valoriIniziali.luogo_nascita || "",
      data_nascita: d.data_nascita || valoriIniziali.data_nascita || "",
      codice_fiscale: d.codice_fiscale || valoriIniziali.codice_fiscale || "",
      residenza: d.residenza || valoriIniziali.residenza || "",
      email: d.email || valoriIniziali.email || "",
      cellulare: d.cellulare || valoriIniziali.cellulare || "",
    }));
  }, [valoriIniziali]);

  const setD = (k: keyof typeof dich, v: string) => setDich((d) => ({ ...d, [k]: v }));

  const consensiCompleti =
    consensi.profilazione !== "" &&
    consensi.marketing_media !== "" &&
    consensi.marketing_diretto !== "";
  const emailOk = emailValida(dich.email);
  const anagraficaOk = dich.nome.trim().length > 0 && dich.cognome.trim().length > 0;
  const modalitaFlag = modalita === "flag";
  const canSubmit =
    (modalitaFlag ? flagConfermato : hasSig) && emailOk && anagraficaOk && consensiCompleti;

  function invia() {
    let dataUrl: string | undefined;
    if (!modalitaFlag) {
      if (!padRef.current) return;
      dataUrl = getCanvasDataURL(padRef.current) || undefined;
      if (!dataUrl) return;
    }
    onSubmit({
      ...(dataUrl ? { firmaDataUrl: dataUrl } : {}),
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
      secondi_permanenza: Math.max(
        0,
        Math.min(86400, Math.round((Date.now() - apertaAlRef.current) / 1000))
      ),
    });
  }

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
    <div className="space-y-6">
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
            placeholder={placeholderSocieta}
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
          <p className="text-xs text-destructive">Esprimi una scelta per tutti e tre i consensi.</p>
        )}
      </Card>

      <Card className="p-6 space-y-3">
        <div className="space-y-1.5 max-w-xs">
          <Label>Data firma</Label>
          <Input type="date" value={dich.data_firma} onChange={(e) => setD("data_firma", e.target.value)} />
        </div>
        {modalitaFlag ? (
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
            <Checkbox
              checked={flagConfermato}
              onCheckedChange={(v) => setFlagConfermato(v === true)}
              className="mt-0.5"
            />
            <span>
              Confermo di aver letto l'informativa e di esprimere le scelte sopra indicate.
            </span>
          </label>
        ) : (
          <>
            <p className="text-sm font-medium">Firma qui sotto per esprimere il consenso:</p>
            <div ref={padRef}>
              <SignaturePad onChange={(empty) => setHasSig(!empty)} />
            </div>
          </>
        )}
        <Button onClick={invia} disabled={!canSubmit || isPending} className="w-full gap-1.5" size="lg">
          <FileCheck2 className="size-4" />
          {isPending ? "Invio in corso..." : inviaLabel}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          {notaFinale ??
            `Cliccando "${inviaLabel}" il consenso verrà registrato con data e ora e riceverai copia del contratto all'indirizzo email indicato.`}
        </p>
      </Card>
    </div>
  );
}
