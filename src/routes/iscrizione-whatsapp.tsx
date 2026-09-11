import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { iscriviWhatsapp } from "@/lib/iscrizione-whatsapp.functions";
import { INFORMATIVA_FULL } from "@/lib/consensi-testi";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";

export const Route = createFileRoute("/iscrizione-whatsapp")({
  component: IscrizioneWhatsappPage,
  validateSearch: (s: Record<string, unknown>) => ({
    origine: s.origine === "qr_pagina" ? "qr_pagina" : "link",
  }),
});

function IscrizioneWhatsappPage() {
  const { origine } = Route.useSearch();
  const iscrivi = useServerFn(iscriviWhatsapp);
  const apertaAl = useRef<number>(Date.now());
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [azienda, setAzienda] = useState("");
  const [email, setEmail] = useState("");
  const [consenso, setConsenso] = useState(false);
  const [consensoMarketing, setConsensoMarketing] = useState(false);
  const [consensoProfilazione, setConsensoProfilazione] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: async () =>
      iscrivi({
        data: {
          numero,
          nome,
          cognome,
          azienda,
          email,
          consenso: true as const,
          consenso_marketing: consensoMarketing,
          consenso_profilazione: consensoProfilazione,
          origine,
          secondi_permanenza: Math.round(
            (Date.now() - apertaAl.current) / 1000
          ),
        },
      }),
    onSuccess: () => {
      setDone(true);
      toast.success("Iscrizione registrata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    numero.trim().length >= 6 &&
    nome.trim() &&
    cognome.trim() &&
    consenso;

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
          <h1 className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
            <MessageCircle className="size-6 text-green-600" /> Offerte su
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Iscriviti per ricevere le promozioni MADE direttamente su WhatsApp.
          </p>
        </div>

        {done ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="size-12 text-green-600 mx-auto mb-3" />
            <h2 className="text-lg font-semibold">Iscrizione completata!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Riceverai le offerte MADE su WhatsApp. Puoi chiudere questa
              pagina.
            </p>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cognome *</Label>
                <Input
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Numero di cellulare *</Label>
              <Input
                type="tel"
                inputMode="tel"
                placeholder="es. 340 1234567"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Impresa (facoltativo)</Label>
              <Input
                placeholder="es. Rossi Costruzioni Srl"
                value={azienda}
                onChange={(e) => setAzienda(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (facoltativa)</Label>
              <Input
                type="email"
                inputMode="email"
                placeholder="es. nome@azienda.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
              <Checkbox
                checked={consenso}
                onCheckedChange={(v) => setConsenso(v === true)}
                className="mt-0.5"
              />
              <span>
                Sì, voglio ricevere le offerte e le novità MADE comodamente su
                WhatsApp. *
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
              <Checkbox
                checked={consensoMarketing}
                onCheckedChange={(v) => setConsensoMarketing(v === true)}
                className="mt-0.5"
              />
              <span>
                Vorrei restare aggiornato sulle promozioni MADE anche via email o
                tramite i nostri contatti.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
              <Checkbox
                checked={consensoProfilazione}
                onCheckedChange={(v) => setConsensoProfilazione(v === true)}
                className="mt-0.5"
              />
              <span>
                Mi piacerebbe ricevere proposte e offerte pensate su misura per me,
                in base ai prodotti che seguo di più.
              </span>
            </label>
            <Button
              onClick={() => submit.mutate()}
              disabled={!canSubmit || submit.isPending}
              className="w-full gap-1.5"
              size="lg"
            >
              <MessageCircle className="size-4" />
              {submit.isPending ? "Iscrizione in corso..." : "Iscrivimi"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              * Campo obbligatorio ·{" "}
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="underline text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
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
            <p className="text-xs text-muted-foreground text-center">
              Potrai disiscriverti in qualsiasi momento rispondendo STOP.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
