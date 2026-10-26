import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isEmailValida } from "@/lib/email-validazione";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getSediIscrizioneWhatsapp,
  iscriviWhatsapp,
} from "@/lib/iscrizione-whatsapp.functions";
import {
  isCodiceFiscaleValido,
  isPartitaIvaValida,
} from "@/lib/iscrizione-whatsapp-dati";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const caricaSedi = useServerFn(getSediIscrizioneWhatsapp);
  const sedi = useQuery({
    queryKey: ["iscrizione-whatsapp-sedi"],
    queryFn: () => caricaSedi(),
    staleTime: 10 * 60 * 1000,
  });
  const apertaAl = useRef<number>(Date.now());
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [azienda, setAzienda] = useState("");
  const [email, setEmail] = useState("");
  const [privato, setPrivato] = useState(false);
  const [partitaIva, setPartitaIva] = useState("");
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [storeId, setStoreId] = useState("");
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
          tipo_soggetto: privato ? "persona_fisica" : "azienda",
          azienda: privato ? undefined : azienda,
          partita_iva: privato ? undefined : partitaIva,
          codice_fiscale: privato ? codiceFiscale : undefined,
          store_id: storeId || undefined,
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

  const pivaValida = isPartitaIvaValida(partitaIva);
  const cfValido = isCodiceFiscaleValido(codiceFiscale);
  const canSubmit =
    numero.trim().length >= 6 &&
    nome.trim() &&
    cognome.trim() &&
    isEmailValida(email) &&
    (privato
      ? !codiceFiscale.trim() || cfValido
      : azienda.trim() !== "" && (!partitaIva.trim() || pivaValida)) &&
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
              <Label>Email *</Label>
              <Input
                type="email"
                inputMode="email"
                placeholder="es. nome@azienda.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {email.trim() !== "" && !isEmailValida(email) && (
                <p className="text-xs text-destructive">Email non valida</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer min-h-10">
              <Checkbox
                checked={privato}
                onCheckedChange={(v) => setPrivato(v === true)}
              />
              <span>Sono un privato</span>
            </label>

            {privato ? (
              <div className="space-y-1.5">
                <Label>Codice fiscale</Label>
                <Input
                  autoCapitalize="characters"
                  placeholder="es. RSSMRA80A01F205X"
                  value={codiceFiscale}
                  onChange={(e) => setCodiceFiscale(e.target.value)}
                />
                {codiceFiscale.trim() !== "" && !cfValido && (
                  <p className="text-xs text-destructive">Codice fiscale non valido</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Nome dell'impresa *</Label>
                  <Input
                    placeholder="es. Rossi Costruzioni Srl"
                    value={azienda}
                    onChange={(e) => setAzienda(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Partita IVA</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="es. 01234567890"
                    value={partitaIva}
                    onChange={(e) => setPartitaIva(e.target.value)}
                  />
                  {partitaIva.trim() !== "" && !pivaValida && (
                    <p className="text-xs text-destructive">Partita IVA non valida</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Sede di riferimento</Label>
              <Select
                value={storeId || "__nessuna__"}
                onValueChange={(v) => setStoreId(v === "__nessuna__" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Scegli una sede" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nessuna__">Nessuna preferenza</SelectItem>
                  {(sedi.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
