import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileText, PenTool, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generaSchedaCliente } from "@/lib/scheda-pdf";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { RuoloSelect } from "@/components/ruolo-select";

export type ClienteInfoWizard = {
  id: string;
  ragione_sociale: string;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
};

const INFORMATIVA_FULL = `Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it - pec madedistribuzionesrl@pecplus.it) in persona del suo presidente Dott. Gian Luca Bellini, ai sensi dell'articolo 13 del GDPR 2016/679, Le fornisce le seguenti informazioni.

TIPI DI DATI: I dati personali (nome, cognome, estremi documento di riconoscimento, telefono, indirizzo e-mail, etc.) sono quelli forniti al momento della sottoscrizione o nel corso del rapporto contrattuale. Tra i dati conferiti possono figurare anche dati di cui all'art. 9 GDPR (categorie particolari di dati).

FINALITA' DI TRATTAMENTO: I dati saranno trattati per finalita' connesse all'esercizio delle attivita' aziendali (fornitura di prodotti nei campi edile, elettrotecnico e idraulico), per adempimenti fiscali/tributari/contributivi, per comunicazione a Enti pubblici o privati prevista per legge, per backup su server esterni con cifratura. Inoltre, previo consenso, per profilazione e analisi dati, per inserimento in pubblicazioni e social network, per invio di comunicazioni pubblicitarie via e-mail, sms, whatsapp.

CATEGORIE DI SOGGETTI: I dati potranno essere comunicati a dipendenti e collaboratori, societa' EDP, commercialisti, studi legali, clienti e fornitori, distributori e vettori, societa' del Gruppo Made, societa' che svolgono attivita' commerciale e di marketing.

MODALITA': Il trattamento sara' effettuato con strumenti manuali e/o informatici nel rispetto dei principi di correttezza, licceita' e trasparenza. E' possibile la cessione dei dati all'estero per finalita' di backup e utilizzo di software con server esteri (Microsoft 365).

TERMINE DI CONSERVAZIONE: I dati vengono conservati per tutta la durata del rapporto contrattuale e nei termini prescrizionali previsti, in ogni caso per non meno di 10 anni per obblighi fiscali.

DIRITTI DELL'INTERESSATO: Lei potra' esercitare i diritti di accesso (art. 15), rettifica (art. 16), cancellazione (art. 17), limitazione (art. 18), opposizione (art. 21), portabilita' (art. 20) e revoca del consenso (art. 7 co. 3) inviando richiesta a gdpr-md@madepoint.it. E' possibile proporre reclamo al Garante Privacy.

TITOLARE: Made Distribuzione S.p.A. - C.F. 10126430965 - gdpr-md@madepoint.it`;

const CONSENSO_TESTI = {
  profilazione: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di analisi anche con strumenti tecnologici automatizzati (profilazione) al fine di consentire al titolare di poter gestire un consolidato nazionale in tempo reale e al fine di poter analizzare i dati caricati sul software per poter indirizzare al meglio le strategie commerciali del network.",
  media: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing.",
  diretto: "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di invio di informative per finalita' pubblicitarie e di marketing, anche via e-mail, sms, whatsapp.",
};

const contattoFormSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().min(1, "Obbligatorio").max(100),
});

type ConsensoVal = "si" | "no" | "";

type Modalita = "con_firma" | "senza_firma" | null;

type ContattoState = {
  nome: string; cognome: string; ruolo: string;
  email: string; cellulare: string; telefono: string; whatsapp: string;
  luogo_nascita: string; data_nascita: string;
  codice_fiscale: string; residenza: string;
  principale: boolean;
};

function emptyContatto(): ContattoState {
  return {
    nome: "", cognome: "", ruolo: "",
    email: "", cellulare: "", telefono: "", whatsapp: "",
    luogo_nascita: "", data_nascita: "",
    codice_fiscale: "", residenza: "", principale: false,
  };
}

export function NuovoContattoWizard({
  cliente,
  showClienteStep = false,
  onClose,
  onSuccess,
}: {
  cliente?: ClienteInfoWizard;
  showClienteStep?: boolean;
  onClose: () => void;
  onSuccess?: (clienteId: string) => void;
}) {
  const qc = useQueryClient();
  const [modalita, setModalita] = useState<Modalita>(null);
  const [step, setStep] = useState(0);
  const [selectedCliente, setSelectedCliente] = useState<ClienteInfoWizard | null>(cliente ?? null);
  const [contatto, setContatto] = useState<ContattoState>(emptyContatto());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [contattoId, setContattoId] = useState<string | null>(null);

  // Firma state
  const todayISO = new Date().toISOString().slice(0, 10);
  const [dich, setDich] = useState({
    nome: "", cognome: "", societa: "",
    luogo_nascita: "", data_nascita: "",
    codice_fiscale: "", residenza: "",
    email: "", cell: "", data_firma: todayISO,
  });
  const [consensi, setConsensi] = useState<{
    profilazione: ConsensoVal; marketing_media: ConsensoVal; marketing_diretto: ConsensoVal;
  }>({ profilazione: "", marketing_media: "", marketing_diretto: "" });
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cliente picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const { data: clientiList } = useQuery({
    enabled: showClienteStep,
    queryKey: ["clienti-wizard-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, partita_iva, codice_fiscale, indirizzo, citta")
        .order("ragione_sociale");
      if (error) throw error;
      return data ?? [];
    },
  });

  const steps = useMemo(() => {
    const s: string[] = [];
    if (showClienteStep) s.push("Cliente");
    s.push("Contatto");
    if (modalita === "con_firma") s.push("Firma");
    return s;
  }, [modalita, showClienteStep]);

  const currentLabel = steps[step];

  function setC<K extends keyof ContattoState>(k: K, v: ContattoState[K]) {
    setContatto((f) => ({ ...f, [k]: v }));
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (currentLabel === "Cliente") {
      if (!selectedCliente) errs.cliente = "Seleziona un cliente";
    }
    if (currentLabel === "Contatto") {
      const p = contattoFormSchema.safeParse({ nome: contatto.nome, cognome: contatto.cognome });
      if (!p.success) p.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
    }
    if (currentLabel === "Firma") {
      if (!dich.nome.trim()) errs.dich_nome = "Obbligatorio";
      if (!dich.cognome.trim()) errs.dich_cognome = "Obbligatorio";
      if (consensi.profilazione !== "si" && consensi.profilazione !== "no") errs.consenso_profilazione = "Scegli un'opzione";
      if (consensi.marketing_media !== "si" && consensi.marketing_media !== "no") errs.consenso_marketing_media = "Scegli un'opzione";
      if (consensi.marketing_diretto !== "si" && consensi.marketing_diretto !== "no") errs.consenso_marketing_diretto = "Scegli un'opzione";
      if (!hasSig) errs.firma = "Firma obbligatoria";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function insertContatto(): Promise<string | null> {
    if (!selectedCliente) return null;
    const payload = {
      cliente_id: selectedCliente.id,
      nome: contatto.nome,
      cognome: contatto.cognome || null,
      ruolo: contatto.ruolo || null,
      email: contatto.email || null,
      cellulare: contatto.cellulare || null,
      telefono: contatto.telefono || null,
      whatsapp: contatto.whatsapp || null,
      luogo_nascita: contatto.luogo_nascita || null,
      data_nascita: contatto.data_nascita || null,
      codice_fiscale: contatto.codice_fiscale || null,
      residenza: contatto.residenza || null,
      principale: contatto.principale,
    };
    const { data, error } = await supabase
      .from("contatti").insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Inserimento non riuscito");
    return data.id;
  }

  function invalidateAll(cid: string) {
    qc.invalidateQueries({ queryKey: ["contatti", cid] });
    qc.invalidateQueries({ queryKey: ["contatti-all"] });
  }

  async function handleAvanti() {
    if (!validateStep()) return;
    // Last contact step in modalita senza_firma → save and close
    if (currentLabel === "Contatto" && modalita === "senza_firma") {
      try {
        setSaving(true);
        const id = await insertContatto();
        if (id && selectedCliente) {
          toast.success("Contatto aggiunto");
          invalidateAll(selectedCliente.id);
          onSuccess?.(selectedCliente.id);
          onClose();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore");
      } finally {
        setSaving(false);
      }
      return;
    }
    // Going to Firma: insert contatto first (only if not already inserted), precompile dich
    const next = steps[step + 1];
    if (next === "Firma" && !contattoId) {
      try {
        setSaving(true);
        const id = await insertContatto();
        if (!id) return;
        setContattoId(id);
        if (selectedCliente) invalidateAll(selectedCliente.id);
        setDich((d) => ({
          ...d,
          nome: d.nome || contatto.nome,
          cognome: d.cognome || contatto.cognome,
          societa: d.societa || selectedCliente?.ragione_sociale || "",
          luogo_nascita: d.luogo_nascita || contatto.luogo_nascita,
          data_nascita: d.data_nascita || contatto.data_nascita,
          codice_fiscale: d.codice_fiscale || contatto.codice_fiscale,
          residenza: d.residenza || contatto.residenza,
          email: d.email || contatto.email,
          cell: d.cell || contatto.cellulare,
        }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore");
        return;
      } finally {
        setSaving(false);
      }
    }
    setStep((s) => s + 1);
  }

  async function handleSalvaFirma() {
    if (!validateStep()) return;
    if (!contattoId || !selectedCliente) return;
    const dataUrl = padRef.current ? getCanvasDataURL(padRef.current) : null;
    if (!dataUrl) { toast.error("Inserisci la firma"); return; }
    setSaving(true);
    try {
      const now = new Date();
      // Upload firma PNG
      const pngBlob = await (await fetch(dataUrl)).blob();
      const firmaPath = `contatti/${contattoId}/firma-${now.getTime()}.png`;
      const { error: e1 } = await supabase.storage.from("firme")
        .upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
      if (e1) throw new Error(`Upload firma: ${e1.message}`);
      const { data: firmaSigned, error: eFs } = await supabase.storage
        .from("firme").createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
      if (eFs || !firmaSigned?.signedUrl) throw new Error("Errore URL firma");

      // Genera PDF
      const pdfBytes = await generaSchedaCliente({
        tipo: "aggiornamento",
        ragioneSociale: selectedCliente.ragione_sociale,
        dichiaranteNome: dich.nome,
        dichiaranteCognome: dich.cognome,
        luogoNascita: dich.luogo_nascita || undefined,
        dataNascita: dich.data_nascita || undefined,
        codiceFiscaleDich: dich.codice_fiscale || undefined,
        partitaIva: selectedCliente.partita_iva || undefined,
        residenza: dich.residenza || undefined,
        emailDich: dich.email || undefined,
        cellulareDich: dich.cell || undefined,
        consensoProfilazione: consensi.profilazione,
        consensoMarketingMedia: consensi.marketing_media,
        consensoMarketingDiretto: consensi.marketing_diretto,
        dataFirma: dich.data_firma || now,
        firmaPngDataUrl: dataUrl,
      });

      const pdfPath = `contatti/${contattoId}/privacy-${now.getTime()}.pdf`;
      const { error: e2 } = await supabase.storage.from("documenti-privacy")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (e2) throw new Error(`Upload PDF: ${e2.message}`);
      const { data: pdfSigned, error: ePs } = await supabase.storage
        .from("documenti-privacy").createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
      if (ePs || !pdfSigned?.signedUrl) throw new Error("Errore URL PDF");

      const { error: e3 } = await supabase.from("contatti").update({
        privacy_firmata: true,
        data_firma: now.toISOString(),
        firma_url: firmaSigned.signedUrl,
        pdf_privacy_url: pdfSigned.signedUrl,
        pdf_privacy_path: pdfPath,
        luogo_nascita: dich.luogo_nascita || null,
        data_nascita: dich.data_nascita || null,
        codice_fiscale: dich.codice_fiscale || null,
        residenza: dich.residenza || null,
        email: dich.email || null,
        cellulare: dich.cell || null,
        consenso_profilazione: consensi.profilazione === "si",
        consenso_marketing_media: consensi.marketing_media === "si",
        consenso_marketing_diretto: consensi.marketing_diretto === "si",
      }).eq("id", contattoId);
      if (e3) throw new Error(`Salvataggio: ${e3.message}`);

      toast.success("Privacy firmata e PDF generato");

      if (dich.email && pdfSigned?.signedUrl) {
        import("@/lib/send-email").then(({ sendPrivacyPdf }) => {
          sendPrivacyPdf({
            toEmail: dich.email!,
            toName: [dich.nome, dich.cognome].filter(Boolean).join(" "),
            ragioneSociale: selectedCliente.ragione_sociale,
            dataFirma: now.toISOString(),
            pdfUrl: pdfSigned.signedUrl,
          }).then((ok) => {
            if (ok) toast.success("PDF privacy inviato per email");
          });
        });
      }

      invalidateAll(selectedCliente.id);
      onSuccess?.(selectedCliente.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio firma");
    } finally {
      setSaving(false);
    }
  }

  // Schermata iniziale modalità
  if (modalita === null) {
    return (
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuovo contatto</DialogTitle>
          <DialogDescription>Scegli come vuoi creare il contatto.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <button
            type="button"
            onClick={() => { setModalita("con_firma"); setStep(0); }}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-accent/40 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <PenTool className="size-5 text-primary" />
              <span className="font-semibold">Crea con firma</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Flusso completo con consenso privacy, firma grafometrica e generazione automatica del PDF MADE.
            </p>
          </button>
          <button
            type="button"
            onClick={() => { setModalita("senza_firma"); setStep(0); }}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-accent/40 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText className="size-5 text-primary" />
              <span className="font-semibold">Crea senza firma</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Inserimento rapido del contatto, senza firma né PDF (potrai raccoglierla dopo).
            </p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const progress = ((step + 1) / steps.length) * 100;
  const isLast = step >= steps.length - 1;
  const filteredClienti = (clientiList ?? []).filter((c) => {
    const q = pickerSearch.toLowerCase();
    return c.ragione_sociale.toLowerCase().includes(q) ||
      String(c.codice_gestionale ?? "").toLowerCase().includes(q);
  }).slice(0, 50);

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          Nuovo contatto
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {modalita === "con_firma" ? "(con firma)" : "(senza firma)"}
          </span>
        </DialogTitle>
        <DialogDescription>
          Step {step + 1} di {steps.length} — {currentLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="space-y-4 mt-2">
        {currentLabel === "Cliente" && (
          <div className="space-y-3">
            <Label>Cliente collegato *</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox"
                  className={cn("w-full justify-between font-normal", !selectedCliente && "text-muted-foreground")}>
                  {selectedCliente?.ragione_sociale || "Cerca cliente per nome o codice..."}
                  <Search className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Cerca cliente..." value={pickerSearch} onValueChange={setPickerSearch} />
                  <CommandList>
                    <CommandEmpty>Nessun cliente trovato</CommandEmpty>
                    <CommandGroup>
                      {filteredClienti.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setSelectedCliente({
                              id: c.id,
                              ragione_sociale: c.ragione_sociale,
                              partita_iva: c.partita_iva,
                              codice_fiscale: c.codice_fiscale,
                              indirizzo: c.indirizzo,
                              citta: c.citta,
                            });
                            setPickerOpen(false);
                            setPickerSearch("");
                          }}
                        >
                          <div className="flex flex-col">
                            <span>{c.ragione_sociale}</span>
                            {c.codice_gestionale && (
                              <span className="text-xs text-muted-foreground">cod. {c.codice_gestionale}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.cliente && <p className="text-xs text-destructive">{errors.cliente}</p>}
          </div>
        )}

        {currentLabel === "Contatto" && (
          <div className="space-y-4">
            {selectedCliente && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Cliente: </span>
                <span className="font-medium">{selectedCliente.ragione_sociale}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={contatto.nome} onChange={(e) => setC("nome", e.target.value)} />
                {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Cognome *</Label>
                <Input value={contatto.cognome} onChange={(e) => setC("cognome", e.target.value)} />
                {errors.cognome && <p className="text-xs text-destructive">{errors.cognome}</p>}
              </div>
            </div>
            <RuoloSelect value={contatto.ruolo} onChange={(v) => setC("ruolo", v)} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={contatto.email} onChange={(e) => setC("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cellulare</Label>
                <Input value={contatto.cellulare} onChange={(e) => setC("cellulare", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefono</Label>
                <Input value={contatto.telefono} onChange={(e) => setC("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input placeholder="+39 333 1234567"
                  value={contatto.whatsapp} onChange={(e) => setC("whatsapp", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Luogo di nascita</Label>
                <Input value={contatto.luogo_nascita} onChange={(e) => setC("luogo_nascita", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data di nascita</Label>
                <Input type="date" value={contatto.data_nascita} onChange={(e) => setC("data_nascita", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Codice fiscale</Label>
                <Input value={contatto.codice_fiscale}
                  onChange={(e) => setC("codice_fiscale", e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Residenza</Label>
                <Input value={contatto.residenza} onChange={(e) => setC("residenza", e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="principale-wiz" checked={contatto.principale}
                onCheckedChange={(v) => setC("principale", v === true)} />
              <Label htmlFor="principale-wiz" className="cursor-pointer text-sm font-normal">
                Contatto principale
              </Label>
            </div>
          </div>
        )}

        {currentLabel === "Firma" && selectedCliente && (
          <StepFirmaContatto
            cliente={selectedCliente}
            dich={dich}
            setDich={setDich}
            consensi={consensi}
            setConsensi={setConsensi}
            padRef={padRef}
            setHasSig={setHasSig}
            errors={errors}
          />
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4 mr-1" /> Indietro
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => { setModalita(null); setStep(0); }}>
            <ArrowLeft className="size-4 mr-1" /> Cambia modalità
          </Button>
        )}
        {!isLast ? (
          <Button type="button" onClick={handleAvanti} disabled={saving}>
            {saving ? "Attendere..." : <>Avanti <ArrowRight className="size-4 ml-1" /></>}
          </Button>
        ) : modalita === "con_firma" ? (
          <Button type="button" onClick={handleSalvaFirma} disabled={saving || !hasSig}>
            {saving ? "Salvataggio..." : <><Check className="size-4 mr-1" /> Salva firma e genera PDF</>}
          </Button>
        ) : (
          <Button type="button" onClick={handleAvanti} disabled={saving}>
            {saving ? "Salvataggio..." : <><Check className="size-4 mr-1" /> Salva contatto</>}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function StepFirmaContatto({
  cliente, dich, setDich, consensi, setConsensi, padRef, setHasSig, errors,
}: {
  cliente: ClienteInfoWizard;
  dich: any;
  setDich: React.Dispatch<React.SetStateAction<any>>;
  consensi: { profilazione: ConsensoVal; marketing_media: ConsensoVal; marketing_diretto: ConsensoVal };
  setConsensi: React.Dispatch<React.SetStateAction<{ profilazione: ConsensoVal; marketing_media: ConsensoVal; marketing_diretto: ConsensoVal }>>;
  padRef: React.RefObject<HTMLDivElement | null>;
  setHasSig: (b: boolean) => void;
  errors: Record<string, string>;
}) {
  const setD = (k: string, v: string) => setDich((d: any) => ({ ...d, [k]: v }));

  const ConsensoBlock = ({
    k, testo, errKey,
  }: { k: "profilazione" | "marketing_media" | "marketing_diretto"; testo: string; errKey: string }) => (
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
      {errors[errKey] && <p className="text-xs text-destructive">{errors[errKey]}</p>}
    </div>
  );

  return (
    <>
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Dati del Dichiarante</p>
        <p className="text-muted-foreground">Nome e cognome precompilati dallo step Contatto.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={dich.nome} onChange={(e) => setD("nome", e.target.value)} />
          {errors.dich_nome && <p className="text-xs text-destructive">{errors.dich_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome *</Label>
          <Input value={dich.cognome} onChange={(e) => setD("cognome", e.target.value)} />
          {errors.dich_cognome && <p className="text-xs text-destructive">{errors.dich_cognome}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Società / Ente rappresentato</Label>
        <Input value={dich.societa} onChange={(e) => setD("societa", e.target.value)}
          placeholder={cliente.ragione_sociale} />
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
          <Input value={dich.codice_fiscale}
            onChange={(e) => setD("codice_fiscale", e.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1.5">
          <Label>Residenza</Label>
          <Input value={dich.residenza} onChange={(e) => setD("residenza", e.target.value)}
            placeholder="Via, n°, CAP, Città (Prov.)" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={dich.email} onChange={(e) => setD("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={dich.cell} onChange={(e) => setD("cell", e.target.value)} />
        </div>
      </div>

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
        <ConsensoBlock k="profilazione" testo={CONSENSO_TESTI.profilazione} errKey="consenso_profilazione" />
        <ConsensoBlock k="marketing_media" testo={CONSENSO_TESTI.media} errKey="consenso_marketing_media" />
        <ConsensoBlock k="marketing_diretto" testo={CONSENSO_TESTI.diretto} errKey="consenso_marketing_diretto" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Data</Label>
          <Input type="date" value={dich.data_firma} onChange={(e) => setD("data_firma", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Firma del dichiarante *</Label>
        <div ref={padRef}>
          <SignaturePad onChange={(empty) => setHasSig(!empty)} height={180} />
        </div>
        {errors.firma && <p className="text-xs text-destructive">{errors.firma}</p>}
      </div>
    </>
  );
}
