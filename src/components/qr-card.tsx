import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvaFile } from "@/lib/salva-file";

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
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await salvaFile(new Blob([blob], { type: "image/png" }), fileName);
    } catch {
      window.open(dataUrl, "_blank");
    }
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
