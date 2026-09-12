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

async function creaIconaWhatsAppDataUrl(size: number): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
    <path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.89L2.05 22l5.3-1.38c1.39.79 3.03 1.22 4.69 1.22 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2z"/>
    <path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.15-.174.2-.298.3-.497.1-.198.05-.371-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.521.074-.797.372-.275.299-1.051 1.027-1.051 2.508 0 1.48 1.077 2.906 1.227 3.106.15.199 2.122 3.239 5.132 4.54.719.31 1.28.496 1.718.635.722.23 1.38.198 1.899.126.58-.08 1.758-.719 2.005-1.336.249-.617.249-1.146.174-1.256-.074-.11-.273-.174-.57-.324z"/>
  </svg>`;

  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas non disponibile"));
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Caricamento icona WhatsApp fallito"));
    img.src = "data:image/svg+xml;base64," + btoa(svg);
  });
}

async function generaLocandina(formato: "A5" | "A6", origin: string) {
  const urlPagina = `${origin}/iscrizione-whatsapp?origine=qr_pagina`;
  const [qrDataUrl, iconaDataUrl] = await Promise.all([
    QRCode.toDataURL(urlPagina, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
    }),
    creaIconaWhatsAppDataUrl(512),
  ]);

  const isA5 = formato === "A5";
  const pageW = isA5 ? 148 : 105;
  const pageH = isA5 ? 210 : 148;
  const scale = pageW / 148;

  const pdf = new jsPDF({ unit: "mm", format: [pageW, pageH] });

  const navy: [number, number, number] = [13, 31, 60];
  const green: [number, number, number] = [37, 211, 102];
  const gray: [number, number, number] = [102, 102, 102];
  const subtitleGray: [number, number, number] = [95, 105, 120];

  const centerX = pageW / 2;
  let y = 12 * scale;

  // Logo MADE
  const logoW = 80 * scale;
  const logoH = logoW * (69 / 490);
  pdf.addImage(
    `data:image/png;base64,${LOGO_MADE_BASE64}`,
    "PNG",
    centerX - logoW / 2,
    y,
    logoW,
    logoH
  );
  y += logoH + 3 * scale;

  // Icona WhatsApp
  const iconSize = pageW * 0.16;
  pdf.addImage(iconaDataUrl, "PNG", centerX - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 2 * scale;

  // Titolo
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22 * scale);
  pdf.text("OFFERTE E NOVITÀ", centerX, y, { align: "center" });
  y += 9 * scale;
  pdf.setTextColor(...green);
  pdf.text("SU WHATSAPP", centerX, y, { align: "center" });
  y += 8 * scale;

  // Sottotitolo (2 righe, ingrandito)
  pdf.setTextColor(...subtitleGray);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11.5 * scale);
  pdf.text("Promozioni esclusive, arrivi merce", centerX, y, { align: "center" });
  y += 5 * scale;
  pdf.text("e sconti riservati ai clienti", centerX, y, { align: "center" });
  y += 3 * scale;

  // MADE DISTRIBUZIONE
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11 * scale);
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
  y += 6 * scale;

  // QR code ridotto con cornice arrotondata sottile navy
  const qrSize = pageW * 0.48;
  const qrX = centerX - qrSize / 2;
  pdf.setDrawColor(...navy);
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
  y += qrSize + 1.5 * scale;

  // Footer
  pdf.setTextColor(...gray);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5 * scale);
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
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Locandina da bancone</h2>
            <p className="text-sm text-muted-foreground">
              Scarica la locandina pronta per la stampa in formato A5 o A6.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => generaLocandina("A5", origin)}
              disabled={!origin}
              className="gap-1.5"
            >
              <Download className="size-4" /> Scarica PDF A5
            </Button>
            <Button
              variant="outline"
              onClick={() => generaLocandina("A6", origin)}
              disabled={!origin}
              className="gap-1.5"
            >
              <Download className="size-4" /> Scarica PDF A6
            </Button>
          </div>
        </div>
      </Card>
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
