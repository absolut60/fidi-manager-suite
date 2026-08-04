import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
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
import { INFORMATIVA_FULL, CONSENSO_TESTI } from "@/lib/consensi-testi";
import { useServerFn } from "@tanstack/react-start";
import {
  SceltaCanalePrivacy, inviaRichiestaDopoCreazione, ModuloConsensoPrivacy,
  inviaRichiestaFirmaPrivacy, registraConsensoDiPersona,
  type CanalePrivacy, type ModuloConsensoPayload,
} from "@/components/privacy-post-creazione";

export type ClienteInfoWizard = {
  id: string;
  ragione_sociale: string;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
};

// INFORMATIVA_FULL e CONSENSO_TESTI ora sono importati da @/lib/consensi-testi
// (fonte unica condivisa con la pagina pubblica /consensi/$token).


const contattoFormSchema = z.object({
  nome: z.string().trim().min(1, "Obbligatorio").max(100),
  cognome: z.string().trim().min(1, "Obbligatorio").max(100),
});

type ConsensoVal = "si" | "no" | "";

type Modalita = CanalePrivacy | null;

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

  const [saving, setSaving] = useState(false);
  const inviaFn = useServerFn(inviaRichiestaFirmaPrivacy);
  const diPersonaFn = useServerFn(registraConsensoDiPersona);

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
    return s;
  }, [showClienteStep]);

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
    if (currentLabel !== "Contatto") {
      setStep((s) => s + 1);
      return;
    }
    // Ultimo step: crea il contatto, poi apri il canale privacy scelto
    let id: string | null = null;
    try {
      setSaving(true);
      id = await insertContatto();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
      return;
    } finally {
      setSaving(false);
    }
    if (!id || !selectedCliente) return;
    invalidateAll(selectedCliente.id);

    if (modalita === "di_persona") {
      toast.success("Contatto creato — compila il modulo privacy");
      setContattoId(id);
      return;
    }
    if (modalita === "a_distanza") {
      await inviaRichiestaDopoCreazione(inviaFn, id, !!contatto.email.trim());
    } else {
      toast.success("Contatto creato — la privacy si raccoglie dopo dalla riga del contatto");
    }
    onSuccess?.(selectedCliente.id);
    onClose();
  }

  async function salvaDiPersona(p: ModuloConsensoPayload) {
    if (!contattoId || !selectedCliente) return;
    setSaving(true);
    try {
      const res = await diPersonaFn({ data: { contattoId, ...p } });
      toast.success(
        res.emailInviata
          ? "Consenso registrato — copia PDF inviata via email"
          : "Consenso registrato — invio email non riuscito, il PDF è archiviato"
      );
      invalidateAll(selectedCliente.id);
      onSuccess?.(selectedCliente.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
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
        <SceltaCanalePrivacy onScegli={(c) => { setModalita(c); setStep(0); }} />
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

  // Modulo consenso "di persona", aperto dopo la creazione del contatto
  if (contattoId && modalita === "di_persona") {
    return (
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consenso privacy — {`${contatto.nome} ${contatto.cognome}`.trim()}</DialogTitle>
          <DialogDescription>
            Contatto creato. Fai compilare e firmare il modulo direttamente all'interessato.
          </DialogDescription>
        </DialogHeader>
        <ModuloConsensoPrivacy
          valoriIniziali={{
            nome: contatto.nome,
            cognome: contatto.cognome,
            societa: selectedCliente?.ragione_sociale ?? "",
            luogo_nascita: contatto.luogo_nascita,
            data_nascita: contatto.data_nascita,
            codice_fiscale: contatto.codice_fiscale,
            residenza: contatto.residenza,
            email: contatto.email,
            cellulare: contatto.cellulare,
          }}
          placeholderSocieta={selectedCliente?.ragione_sociale}
          onSubmit={salvaDiPersona}
          isPending={saving}
          inviaLabel="Conferma e firma"
        />
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          Nuovo contatto
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {modalita === "di_persona"
              ? "(compila di persona)"
              : modalita === "a_distanza"
                ? "(richiesta a distanza)"
                : "(senza privacy)"}
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
        ) : (
          <Button type="button" onClick={handleAvanti} disabled={saving}>
            {saving ? "Salvataggio..." : <><Check className="size-4 mr-1" /> Crea contatto</>}
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
