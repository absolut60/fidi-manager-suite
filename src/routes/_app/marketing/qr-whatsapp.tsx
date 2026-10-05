import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, QrCode as QrIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCard } from "@/components/qr-card";
import locandinaA5 from "@/assets/locandina-whatsapp-A5.pdf.asset.json";
import locandinaA6 from "@/assets/locandina-whatsapp-A6.pdf.asset.json";


export const Route = createFileRoute("/_app/marketing/qr-whatsapp")({
  component: QrWhatsappPage,
});

const NUMERO_WA = "393407318447";
const TESTO_CHAT = "Ciao MADE, voglio ricevere le vostre offerte su WhatsApp";

function scaricaLocandina(url: string, nomeFile: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeFile;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
              onClick={() =>
                scaricaLocandina(locandinaA5.url, "locandina-whatsapp-A5.pdf")
              }
              className="gap-1.5"
            >
              <Download className="size-4" /> Scarica PDF A5
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                scaricaLocandina(locandinaA6.url, "locandina-whatsapp-A6.pdf")
              }
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
