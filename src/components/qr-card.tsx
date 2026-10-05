import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function QrCard({
  titolo,
  descrizione,
  url,
  nomeFile,
}: {
  titolo: string;
  descrizione: string;
  url: string;
  nomeFile?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  const scarica = async () => {
    if (!dataUrl) return;
    const fileName = nomeFile ?? `qr-${titolo.toLowerCase().replace(/\s+/g, "-")}.png`;

    // Prova la Web Share API con file (ideale su mobile: apre "Condividi" → Salva immagine)
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: fileName });
        return;
      }
    } catch {
      /* share non disponibile o annullato: passo ai fallback */
    }

    // Desktop: download classico
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    } catch {
      /* download bloccato: ultimo fallback */
    }

    // Ultimo fallback: apri l'immagine in una nuova scheda (long-press per salvare)
    window.open(dataUrl, "_blank");
  };
  const copia = () => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiato");
  };

  return (
    <Card className="p-6 space-y-4 flex flex-col items-center text-center">
      <div>
        <h3 className="font-semibold">{titolo}</h3>
        <p className="text-sm text-muted-foreground">{descrizione}</p>
      </div>
      {dataUrl ? (
        <img src={dataUrl} alt={titolo} className="w-56 h-56" />
      ) : (
        <div className="w-56 h-56 bg-muted animate-pulse rounded-md" />
      )}
      <div className="w-full space-y-2">
        <div className="flex gap-2">
          <Input readOnly value={url} className="text-xs" />
          <Button variant="outline" size="icon" onClick={copia}>
            <Copy className="size-4" />
          </Button>
        </div>
        <Button onClick={scarica} disabled={!dataUrl} className="w-full gap-1.5">
          <Download className="size-4" /> Scarica PNG
        </Button>
      </div>
    </Card>
  );
}
