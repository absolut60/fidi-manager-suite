import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getEventoIscrizionePubblica,
  iscriviEventoPubblico,
} from "@/lib/iscrizione-evento.functions";
import { iscriviWhatsapp } from "@/lib/iscrizione-whatsapp.functions";
import { INFORMATIVA_FULL } from "@/lib/consensi-testi";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";
import { formatDataEvento } from "@/lib/eventi-costanti";

export const Route = createFileRoute("/iscrizione-evento/$codice")({
  component: IscrizioneEventoPage,
  head: () => ({
    meta: [
      { title: "Iscrizione evento — MADE" },
      { name: "description", content: "Iscriviti a un evento MADE Distribuzione." },
      { property: "og:title", content: "Iscrizione evento — MADE" },
      { property: "og:description", content: "Iscriviti a un evento MADE Distribuzione." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function IscrizioneEventoPage() {
  const { codice } = Route.useParams();
  const getEvento = useServerFn(getEventoIscrizionePubblica);
  const iscrivi = useServerFn(iscriviEventoPubblico);
  const iscriviWa = useServerFn(iscriviWhatsapp);
  const apertaAl = useRef<number>(Date.now());

  const codiceValido = /^[a-z0-9]{6,40}$/.test(codice);
  const { data: evento, isLoading, isError, refetch } = useQuery({
    queryKey: ["iscrizione-evento", codice],
    enabled: codiceValido,
    queryFn: () => getEvento({ data: { codice } }),
    retry: false,
  });

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [cellulare, setCellulare] = useState("");
  const [azienda, setAzienda] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [esito, setEsito] = useState<{ giaPresente: boolean } | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const r = await iscrivi({
        data: { codice, nome, cognome, cellulare, azienda, email },
      });
      if (whatsapp) {
        try {
          await iscriviWa({
            data: {
              numero: cellulare,
              nome,
              cognome,
              azienda,
              email,
              consenso: true as const,
              consenso_marketing: false,
              consenso_profilazione: false,
              origine: "qr_pagina",
              secondi_permanenza: Math.round((Date.now() - apertaAl.current) / 1000),
            },
          });
        } catch {
          toast.warning(
            "Iscrizione all'evento registrata. Non è stato possibile attivare le offerte WhatsApp.",
          );
        }
      }
      return r;
    },
    onSuccess: (r) => setEsito({ giaPresente: r.giaPresente }),
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = nome.trim() && cognome.trim() && cellulare.trim().length >= 6;

  let contenuto: React.ReactNode;
  if (codiceValido && isLoading) {
    contenuto = (
      <Card className="p-6 space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  } else if (isError) {
    contenuto = (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold">
          Non è stato possibile caricare l&apos;evento
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Controlla la connessione e riprova.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Riprova
        </Button>
      </Card>
    );
  } else if (!evento || !evento.trovato) {
    contenuto = (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold">Evento non trovato</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Il link o il QR non corrisponde a nessun evento.
        </p>
      </Card>
    );
  } else if (esito) {
    contenuto = (
      <Card className="p-8 text-center">
        <CheckCircle2 className="size-12 text-green-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold">Iscrizione completata!</h2>
        <p className="text-sm font-medium mt-2 break-words">{evento.nome}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {esito.giaPresente ? "Risulti già iscritto a questo evento." : "Ti aspettiamo."}
        </p>
      </Card>
    );
  } else if (!evento.aperte) {
    contenuto = (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold break-words">{evento.nome}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Le iscrizioni a questo evento sono chiuse.
        </p>
      </Card>
    );
  } else {
    contenuto = (
      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ie-nome">Nome *</Label>
            <Input id="ie-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ie-cognome">Cognome *</Label>
            <Input id="ie-cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-cell">Numero di cellulare *</Label>
          <Input
            id="ie-cell"
            type="tel"
            inputMode="tel"
            value={cellulare}
            onChange={(e) => setCellulare(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-azienda">Impresa (facoltativo)</Label>
          <Input id="ie-azienda" value={azienda} onChange={(e) => setAzienda(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-email">Email (facoltativa)</Label>
          <Input
            id="ie-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
          <Checkbox
            checked={whatsapp}
            onCheckedChange={(v) => setWhatsapp(v === true)}
            className="mt-0.5"
          />
          <span>Sì, voglio ricevere anche le offerte e le novità MADE su WhatsApp.</span>
        </label>
        <Button
          onClick={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
          className="w-full"
          size="lg"
        >
          {submit.isPending ? "Iscrizione in corso..." : "Iscrivimi all'evento"}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          * Campo obbligatorio ·{" "}
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="underline text-primary">
                Leggi l&apos;informativa completa
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Informativa privacy</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-xs leading-relaxed">
                {INFORMATIVA_FULL}
              </div>
            </DialogContent>
          </Dialog>
        </p>
      </Card>
    );
  }

  const ev = evento && evento.trovato ? evento : null;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <img
            src={`data:image/png;base64,${LOGO_MADE_BASE64}`}
            alt="MADE"
            className="h-12 w-auto mx-auto mb-4"
            style={{ aspectRatio: "490 / 69" }}
          />
          <h1 className="text-2xl font-bold tracking-tight">Iscrizione all&apos;evento</h1>
          {ev && (
            <>
              <p className="text-lg font-semibold text-primary mt-2 break-words">{ev.nome}</p>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                {ev.data_evento && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4 shrink-0" />
                    {formatDataEvento(ev.data_evento)}
                  </span>
                )}
                {ev.luogo && (
                  <span className="inline-flex items-center gap-1 min-w-0 break-words">
                    <MapPin className="size-4 shrink-0" />
                    {ev.luogo}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        {contenuto}
      </div>
    </div>
  );
}
