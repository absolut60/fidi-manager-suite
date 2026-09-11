import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { Copy, Download, QrCode as QrIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";


export const Route = createFileRoute("/_app/marketing/qr-whatsapp")({
  component: QrWhatsappPage,
});

const NUMERO_WA = "393407318447";
const TESTO_CHAT = "Ciao MADE, voglio ricevere le vostre offerte su WhatsApp";

function QrCard({
  titolo,
  descrizione,
  url,
}: {
  titolo: string;
  descrizione: string;
  url: string;
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
    const fileName = `qr-${titolo.toLowerCase().replace(/\s+/g, "-")}.png`;

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

async function generaLocandina(formato: "A5" | "A6", origin: string) {
  const urlPagina = `${origin}/iscrizione-whatsapp?origine=qr_pagina`;
  const qrDataUrl = await QRCode.toDataURL(urlPagina, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const isA5 = formato === "A5";
  const pageW = isA5 ? 148 : 105;
  const pageH = isA5 ? 210 : 148;
  const scale = pageW / 148;

  const pdf = new jsPDF({ unit: "mm", format: [pageW, pageH] });

  const navy = [13 / 255, 31 / 255, 60 / 255];
  const green = [37 / 255, 211 / 255, 102 / 255];
  const gray = [102 / 255, 102 / 255, 102 / 255];
  const borderGray = [220 / 255, 220 / 255, 220 / 255];

  const marginX = 10 * scale;
  const centerX = pageW / 2;
  let y = 12 * scale;

  // Logo MADE
  const logoW = 90 * scale;
  const logoH = logoW * (69 / 490);
  pdf.addImage(
    `data:image/png;base64,${LOGO_MADE_BASE64}`,
    "PNG",
    centerX - logoW / 2,
    y,
    logoW,
    logoH
  );
  y += logoH + 8 * scale;

  // Titolo
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22 * scale);
  pdf.text("OFFERTE E NOVITÀ", centerX, y, { align: "center" });
  y += 9 * scale;
  pdf.setTextColor(...green);
  pdf.text("SU WHATSAPP", centerX, y, { align: "center" });
  y += 10 * scale;

  // Sottotitolo
  pdf.setTextColor(...gray);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5 * scale);
  pdf.text(
    "Promozioni esclusive, arrivi merce e sconti riservati ai clienti",
    centerX,
    y,
    { align: "center" }
  );
  y += 7 * scale;

  // MADE DISTRIBUZIONE
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12 * scale);
  pdf.text("MADE DISTRIBUZIONE", centerX, y, { align: "center" });
  y += 10 * scale;

  // Freccia giù + invito
  const arrowY = y - 1 * scale;
  pdf.setDrawColor(...green);
  pdf.setLineWidth(0.7 * scale);
  pdf.line(centerX, arrowY - 5 * scale, centerX, arrowY + 1 * scale);
  pdf.line(
    centerX - 2.5 * scale,
    arrowY - 1 * scale,
    centerX,
    arrowY + 1 * scale
  );
  pdf.line(
    centerX + 2.5 * scale,
    arrowY - 1 * scale,
    centerX,
    arrowY + 1 * scale
  );
  y += 4 * scale;
  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11 * scale);
  pdf.text("Inquadra il QR e iscriviti", centerX, y, { align: "center" });
  y += 8 * scale;

  // QR code grande con cornice sottile
  const qrSize = 80 * scale;
  const qrX = centerX - qrSize / 2;
  pdf.setDrawColor(...borderGray);
  pdf.setLineWidth(0.5 * scale);
  pdf.roundedRect(
    qrX - 2 * scale,
    y - 2 * scale,
    qrSize + 4 * scale,
    qrSize + 4 * scale,
    2 * scale,
    2 * scale,
    "S"
  );
  pdf.addImage(qrDataUrl, "PNG", qrX, y, qrSize, qrSize);
  y += qrSize + 8 * scale;

  // Footer
  pdf.setTextColor(...gray);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5 * scale);
  pdf.text(
    "Iscrizione in 30 secondi · Puoi disiscriverti quando vuoi",
    centerX,
    y,
    { align: "center" }
  );

  pdf.save(`locandina-whatsapp-${formato}.pdf`);
}

function QrWhatsappPage() {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const urlPagina = origin
    ? `${origin}/iscrizione-whatsapp?origine=qr_pagina`
    : "";
  const urlChat = `https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(
    TESTO_CHAT
  )}`;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <QrIcon className="size-6" /> QR WhatsApp
        </h1>
        <p className="text-muted-foreground mt-1">
          Stampa questi QR sui materiali del punto vendita per raccogliere
          iscrizioni WhatsApp.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QrCard
          titolo="Pagina iscrizione"
          descrizione="Apre il modulo di consenso. È la via consigliata: registra il consenso a norma."
          url={urlPagina}
        />
        <QrCard
          titolo="Chat WhatsApp"
          descrizione="Apre una chat verso il numero MADE con un messaggio pronto. Utile come primo contatto."
          url={urlChat}
        />
      </div>
    </div>
  );
}
