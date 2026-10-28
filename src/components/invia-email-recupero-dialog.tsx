// Finestra UNICA "Invia email al cliente" (FM48): sostituisce InviaSollecitoDialog
// ed EmailLiberaDialog. L'invio passa SOLO dalla server function inviaEmailRecupero.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, AlertTriangle, Upload, X, FileText, Gavel } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfig } from "@/hooks/use-config";
import { inviaEmailRecupero } from "@/lib/email-recupero.functions";
import { caricaSedeCliente, renderTemplate, wrapEmailHtml, type TemplateEmail } from "@/lib/template-email";
import { formatEuro, formatDateIt, livelloSollecitoFromTipo, type ScadenzaSollecito } from "@/lib/template-email-render";
import { scegliTemplatePerLivello, TIPO_TEMPLATE_PER_LIVELLO, type StadioSollecito } from "@/lib/escalation-solleciti";
import { STADIO_LABEL, StadioSollecitoBadge } from "@/components/stadio-sollecito-badge";
import { caricaDatiClienteLettera, renderLettera, type TemplateLettera } from "@/lib/template-lettera";
import { classificaScadenza } from "@/lib/scadenze";
import { isEmailValida } from "@/lib/email-validazione";
import { puoInviareComunicazioniRecupero } from "@/lib/recupero-permessi";
import { ReminderControls, defaultReminderFor, creaFollowUp, type ReminderState } from "@/components/reminder-controls";
import { CampoCopie, type DestinatarioCopia } from "@/components/email-recupero/campo-copie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Modalita = "modello" | "libera";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  modalitaIniziale?: Modalita;
  /** Se fornito, l'invio completa questa azione email "da fare" invece di crearne una nuova. */
  azioneEsistenteId?: string | null;
  onSent?: () => void;
};

const MAX_INDIRIZZI = 10;
const MAX_ALLEGATI_BYTES = 10 * 1024 * 1024;
const LETTERA_LIBERA = "__libera__";
const CAMPI_DEST = ["email", "email_2", "email_3", "pec"] as const;
type CampoDest = (typeof CAMPI_DEST)[number];
const ETICHETTA_DEST: Record<CampoDest, string> = {
  email: "Email", email_2: "Email 2", email_3: "Email 3", pec: "PEC",
};

type ClienteInfo = {
  id: string; ragione_sociale: string;
  email: string | null; email_2: string | null; email_3: string | null; pec: string | null;
};
type ScadenzaRiga = ScadenzaSollecito & { id: string };
type AllegatoCliente = {
  id: string; nome_file: string; created_at: string; descrizione: string | null; dimensione_bytes: number | null;
};

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function leggiBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(new Error(`Impossibile leggere "${file.name}"`));
    r.readAsDataURL(file);
  });
}

function dataIt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0 min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titolo}</h3>
      {children}
    </section>
  );
}

export function InviaEmailRecuperoDialog({
  open, onOpenChange, clienteId, modalitaIniziale = "modello", azioneEsistenteId, onSent,
}: Props) {
  const qc = useQueryClient();
  const { user, profilo, roles } = useAuth();
  const puoInviare = puoInviareComunicazioniRecupero(roles as string[]);
  const appCfg = useConfig();
  const speseUnit = appCfg.spese_insoluto_riba_eur;
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";
  const invia = useServerFn(inviaEmailRecupero);
  const abilitato = open && !!clienteId && puoInviare;

  const [destSource, setDestSource] = useState<CampoDest | "custom">("custom");
  const [destEmail, setDestEmail] = useState("");
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [modalita, setModalita] = useState<Modalita>(modalitaIniziale);
  const [templateId, setTemplateId] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [baseLiberaId, setBaseLiberaId] = useState("");
  const [selScad, setSelScad] = useState<Set<string>>(new Set());
  const [nuoviFile, setNuoviFile] = useState<File[]>([]);
  const [selAllegati, setSelAllegati] = useState<Set<string>>(new Set());
  const [letteraOn, setLetteraOn] = useState(false);
  const [letteraTplId, setLetteraTplId] = useState("");
  const [letteraOggetto, setLetteraOggetto] = useState("");
  const [letteraCorpo, setLetteraCorpo] = useState("");
  const [reminder, setReminder] = useState<ReminderState>(defaultReminderFor("email"));
  const [sending, setSending] = useState(false);
  const [erroreModello, setErroreModello] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const destInit = useRef(false);
  const tplInit = useRef(false);
  const scadInit = useRef(false);

  // Reset all'apertura
  useEffect(() => {
    if (!open) { setSending(false); return; }
    setDestSource("custom"); setDestEmail(""); setCc([]); setBcc([]);
    setModalita(modalitaIniziale); setTemplateId(""); setOggetto(""); setCorpo(""); setBaseLiberaId("");
    setSelScad(new Set()); setNuoviFile([]); setSelAllegati(new Set());
    setLetteraOn(false); setLetteraTplId(""); setLetteraOggetto(""); setLetteraCorpo("");
    setReminder(defaultReminderFor("email"));
    setErroreModello(null);
    destInit.current = false; tplInit.current = false; scadInit.current = false;
  }, [open, modalitaIniziale]);

  const { data: cliente } = useQuery({
    queryKey: ["invia-email-recupero-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, email, email_2, email_3, pec")
        .eq("id", clienteId)
        .maybeSingle();
      if (error) throw error;
      return data as ClienteInfo | null;
    },
    enabled: abilitato,
  });

  const { data: colleghi } = useQuery({
    queryKey: ["destinatari-copia-recupero", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_destinatari_copia_recupero", { _cliente_id: clienteId });
      if (error) throw error;
      return (data ?? []) as DestinatarioCopia[];
    },
    enabled: abilitato,
  });

  const { data: templates } = useQuery({
    queryKey: ["template-email-attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_email")
        .select("id, nome, oggetto, corpo, tipo, attivo")
        .eq("attivo", true)
        .order("nome");
      if (error) throw error;
      return data as TemplateEmail[];
    },
    enabled: open && puoInviare,
  });
  const templatesInvio = useMemo(
    () => (templates ?? []).filter((t) => t.tipo !== "promemoria_scadenza"),
    [templates],
  );

  // Stadio del cliente: fonte unica get_stadio_sollecito_clienti.
  const { data: stadioCli, isFetched: stadioPronto } = useQuery({
    queryKey: ["invia-email-stadio", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stadio_sollecito_clienti", { _cliente_ids: [clienteId] });
      if (error) throw error;
      return (((data ?? []) as unknown as StadioSollecito[])[0] ?? null);
    },
    enabled: abilitato,
  });

  const { data: scadute, isLoading: scadLoading } = useQuery({
    queryKey: ["invia-email-recupero-scadute", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_documento, data_scadenza, importo_scadenza, codice_pagamento, stato_contabile, giorni_ritardo, tempi_scadenza, data_pagamento_effettiva")
        .eq("cliente_id", clienteId)
        .order("data_scadenza", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((s) => classificaScadenza(s) === "scaduto")
        .map((s): ScadenzaRiga => ({
          id: s.id,
          numero_documento: s.numero_documento,
          data_documento: s.data_documento,
          data_scadenza: s.data_scadenza,
          importo_scadenza: s.importo_scadenza,
          codice_pagamento: s.codice_pagamento,
        }));
    },
    enabled: abilitato,
  });

  const { data: datiSede } = useQuery({
    queryKey: ["sollecito-sede", clienteId],
    queryFn: () => caricaSedeCliente(clienteId),
    enabled: abilitato,
  });

  const { data: allegatiCliente } = useQuery({
    queryKey: ["allegati", "cliente-pdf", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allegati")
        .select("id, nome_file, created_at, descrizione, dimensione_bytes")
        .eq("cliente_id", clienteId)
        .eq("mime_type", "application/pdf")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AllegatoCliente[];
    },
    enabled: abilitato,
  });

  const { data: templatesLettera, isLoading: lettLoading } = useQuery({
    queryKey: ["template_lettera", "attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_lettera")
        .select("id, nome, oggetto, corpo, tipo, usa_dati_automatici, attivo")
        .eq("attivo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateLettera[];
    },
    enabled: abilitato && letteraOn,
  });

  // Destinatario di default: prima valorizzata tra email, email_2, email_3, pec
  useEffect(() => {
    if (!cliente || destInit.current) return;
    destInit.current = true;
    const primo = CAMPI_DEST.find((k) => cliente[k]?.trim());
    if (primo) { setDestSource(primo); setDestEmail(cliente[primo]!.trim()); }
  }, [cliente]);

  // Modello preselezionato dal livello successivo (fonte unica scegliTemplatePerLivello).
  // In caso di errore: selezione di prima (tipo atteso o primo modello) + errore in piccolo.
  useEffect(() => {
    if (tplInit.current || !templatesInvio.length || !stadioPronto) return;
    tplInit.current = true;
    const livello = stadioCli?.livello_successivo ?? 1;
    try {
      setTemplateId(scegliTemplatePerLivello(templatesInvio, livello).id);
      setErroreModello(null);
    } catch (e) {
      setErroreModello(e instanceof Error ? e.message : String(e));
      const atteso = TIPO_TEMPLATE_PER_LIVELLO[livello];
      const t = templatesInvio.find((x) => x.tipo === atteso) ?? templatesInvio[0];
      setTemplateId(t.id);
    }
  }, [templatesInvio, stadioPronto, stadioCli]);

  // Email da fare esistente: scadenze collegate all'azione (azioni_recupero_scadenze).
  const { data: scadCollegate } = useQuery({
    queryKey: ["invia-email-recupero-collegate", azioneEsistenteId],
    enabled: open && !!azioneEsistenteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select("scadenza_id")
        .eq("azione_id", azioneEsistenteId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.scadenza_id as string);
    },
  });
  // Collegate ancora scadute: `scadute` è già filtrato con classificaScadenza.
  const collegateScadute = useMemo(() => {
    if (!azioneEsistenteId || !scadute || !scadCollegate) return null;
    const ids = new Set(scadCollegate);
    return scadute.filter((s) => ids.has(s.id)).map((s) => s.id);
  }, [azioneEsistenteId, scadute, scadCollegate]);

  // Scadenze di default all'arrivo dei dati
  useEffect(() => {
    if (!scadute || scadInit.current) return;
    if (azioneEsistenteId) {
      if (!collegateScadute) return;
      scadInit.current = true;
      setSelScad(new Set(collegateScadute));
      return;
    }
    scadInit.current = true;
    setSelScad(modalita === "modello" ? new Set(scadute.map((s) => s.id)) : new Set());
  }, [scadute, modalita, azioneEsistenteId, collegateScadute]);

  function cambiaModalita(m: Modalita) {
    setModalita(m);
    setSelScad(m === "modello" ? new Set((scadute ?? []).map((s) => s.id)) : new Set());
  }

  // Lettera: carica oggetto/corpo come LetteraPdfDialog
  useEffect(() => {
    if (!open || !letteraOn || !letteraTplId || letteraTplId === LETTERA_LIBERA) return;
    const tpl = (templatesLettera ?? []).find((t) => t.id === letteraTplId);
    if (!tpl) return;
    let annullato = false;
    (async () => {
      try {
        const nomeOp = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || (user?.email ?? "");
        const dati = await caricaDatiClienteLettera(clienteId, nomeOp);
        const r = renderLettera({ oggetto: tpl.oggetto, corpo: tpl.corpo }, dati, { speseImportoUnitario: speseUnit });
        if (annullato) return;
        setLetteraOggetto(r.oggetto);
        setLetteraCorpo(r.corpo);
      } catch (e: any) {
        if (!annullato) toast.error("Errore anteprima lettera: " + (e?.message ?? "—"));
      }
    })();
    return () => { annullato = true; };
  }, [letteraTplId, letteraOn, open]); // eslint-disable-line

  const selectedTemplate = useMemo(
    () => templatesInvio.find((t) => t.id === templateId) ?? null,
    [templatesInvio, templateId],
  );
  const scadenzeScelte = useMemo(
    () => (scadute ?? []).filter((s) => selScad.has(s.id)),
    [scadute, selScad],
  );
  const totaleScelte = scadenzeScelte.reduce((a, s) => a + Number(s.importo_scadenza ?? 0), 0);

  const corpoLiberoHtml = useMemo(() => {
    const sembraHtml = /<[a-z][\s\S]*>/i.test(corpo);
    return sembraHtml ? corpo : corpo.replace(/\n/g, "<br/>");
  }, [corpo]);

  const rendered = useMemo(() => {
    if (!cliente || !scadute) return null;
    const dati = {
      ragione_sociale: cliente.ragione_sociale ?? "",
      nome_operatore: nomeOperatore,
      scadenze: scadenzeScelte.map(({ id: _id, ...s }) => s),
    };
    const mittente = { nome: nomeOperatore, email: user?.email ?? null };
    if (modalita === "modello") {
      if (!selectedTemplate) return null;
      const base = renderTemplate(
        { oggetto: selectedTemplate.oggetto, corpo: selectedTemplate.corpo },
        dati,
        { tipo: selectedTemplate.tipo, speseImportoUnitario: speseUnit },
      );
      return { oggetto: base.oggetto, corpo: wrapEmailHtml(base.corpo, datiSede ?? null, mittente, { tipo: selectedTemplate.tipo }) };
    }
    const base = renderTemplate({ oggetto, corpo: corpoLiberoHtml }, dati, { speseImportoUnitario: speseUnit });
    return { oggetto: base.oggetto, corpo: wrapEmailHtml(base.corpo, datiSede ?? null, mittente, { senzaBande: true }) };
  }, [cliente, scadute, scadenzeScelte, modalita, selectedTemplate, oggetto, corpoLiberoHtml, datiSede, nomeOperatore, user?.email, speseUnit]);

  // Indirizzi
  const dest = destEmail.trim();
  const tuttiIndirizzi = [dest, ...cc, ...bcc].filter(Boolean);
  const usati = new Set(tuttiIndirizzi.map((e) => e.toLowerCase()));
  const limiteRaggiunto = tuttiIndirizzi.length >= MAX_INDIRIZZI;
  const destDuplicato = !!dest && [...cc, ...bcc].some((e) => e.toLowerCase() === dest.toLowerCase());
  const indirizziCliente = cliente ? CAMPI_DEST.filter((k) => cliente[k]?.trim()) : [];
  const senzaIndirizzo = !!cliente && indirizziCliente.length === 0;

  // Allegati
  const bytesNuovi = nuoviFile.reduce((a, f) => a + f.size, 0);
  const bytesEsistenti = (allegatiCliente ?? [])
    .filter((a) => selAllegati.has(a.id))
    .reduce((a, x) => a + Number(x.dimensione_bytes ?? 0), 0);
  const bytesTotali = bytesNuovi + bytesEsistenti;
  const oltreLimite = bytesTotali > MAX_ALLEGATI_BYTES;
  const letteraLibera = letteraTplId === LETTERA_LIBERA;
  const letteraOk = !letteraOn || (!!letteraTplId && !!letteraCorpo.trim() && (!letteraLibera || !!letteraOggetto.trim()));

  function onPickSource(src: CampoDest | "custom") {
    setDestSource(src);
    if (src !== "custom") setDestEmail(cliente?.[src]?.trim() ?? "");
  }

  function aggiungiFile(lista: FileList | null) {
    if (!lista) return;
    const pdf: File[] = [];
    for (const f of Array.from(lista)) {
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) { toast.error(`"${f.name}" non è un PDF: ammessi solo file PDF.`); continue; }
      pdf.push(f);
    }
    setNuoviFile((prev) => [...prev, ...pdf]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function precaricaLibera(id: string) {
    setBaseLiberaId(id);
    const t = templatesInvio.find((x) => x.id === id);
    if (t) { setOggetto(t.oggetto ?? ""); setCorpo(t.corpo ?? ""); }
  }

  const testoOk = modalita === "modello" ? !!selectedTemplate : !!oggetto.trim() && !!corpo.trim();
  // Livello del modello scelto (null se non è un sollecito) e vincolo fatture scadute.
  const livelloScelto = modalita === "modello" && selectedTemplate ? livelloSollecitoFromTipo(selectedTemplate.tipo) : null;
  const livelloProposto = stadioCli?.livello_successivo ?? null;
  const bloccoSenzaScaduto = !!livelloScelto && scadenzeScelte.length === 0;
  const puoInviareOra =
    !sending && !!rendered && testoOk && isEmailValida(dest) && !destDuplicato &&
    tuttiIndirizzi.length <= MAX_INDIRIZZI && !oltreLimite && letteraOk && !bloccoSenzaScaduto;

  async function handleInvia() {
    if (!puoInviare || !puoInviareOra) return;
    setSending(true);
    try {
      const nuoviAllegati = await Promise.all(
        nuoviFile.map(async (f) => ({ filename: f.name, contentType: "application/pdf", base64: await leggiBase64(f) })),
      );
      const scadenzaIds = scadenzeScelte.map((s) => s.id);
      const res = await invia({
        data: {
          clienteId,
          azioneEsistenteId: azioneEsistenteId ?? null,
          modalita,
          templateId: modalita === "modello" ? templateId : null,
          oggetto: modalita === "libera" ? oggetto : null,
          corpo: modalita === "libera" ? corpo : null,
          scadenzaIds,
          to: dest,
          cc,
          bcc,
          allegatiEsistentiIds: [...selAllegati],
          nuoviAllegati,
          lettera: letteraOn
            ? { templateLetteraId: letteraLibera ? null : letteraTplId, oggetto: letteraOggetto, corpo: letteraCorpo }
            : null,
        },
      });

      toast.success(
        res.propostaLegaleCreata ? "Email inviata · Cliente proposto per il passaggio al legale" : "Email inviata",
      );
      if (res.avvisi.length) {
        toast.warning(`Email inviata con avvisi:\n${res.avvisi.join("\n")}`, { duration: 15000 });
      }

      if (reminder.attivo && reminder.giorni > 0) {
        try {
          await creaFollowUp({
            clienteId,
            operatoreId: user?.id ?? null,
            dataPrincipale: new Date(),
            giorni: reminder.giorni,
            tipoOriginale: "email",
            importoRiferimento: totaleScelte,
            scadenzeIds: scadenzaIds,
            descrizioneOriginale: modalita === "modello"
              ? `sollecito "${selectedTemplate?.nome ?? ""}"`
              : "email libera",
          });
        } catch (e: any) {
          console.error("Follow-up error", e);
          toast.warning("Email inviata, ma follow-up non creato: " + (e?.message ?? "errore"));
        }
      }

      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-calendario"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["allegati"] });
      qc.invalidateQueries({ queryKey: ["recupero-stadio-cliente", clienteId] });
      qc.invalidateQueries({ queryKey: ["invia-email-stadio", clienteId] });
      qc.invalidateQueries({ queryKey: ["recupero-agenzia"] });
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Invio non riuscito", { duration: 12000 });
    } finally {
      setSending(false);
    }
  }

  const contentCls =
    "flex flex-col gap-0 p-0 left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-hidden " +
    "sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg";

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className={contentCls}>
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 border-b border-border text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Send className="size-5 shrink-0" /> {azioneEsistenteId ? "Invia l'email da fare" : "Invia email al cliente"}
          </DialogTitle>
          <DialogDescription className="break-words">
            {cliente ? <>Cliente: <strong>{cliente.ragione_sociale}</strong></> : "Caricamento cliente..."}
          </DialogDescription>
        </DialogHeader>

        {!puoInviare ? (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              L'invio delle comunicazioni di recupero è riservato al Recupero crediti.
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
              {/* a) Destinatario */}
              <Sezione titolo="Destinatario">
                <RadioGroup value={destSource} onValueChange={(v) => onPickSource(v as CampoDest | "custom")} className="space-y-1">
                  {indirizziCliente.map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm cursor-pointer min-h-10 min-w-0">
                      <RadioGroupItem value={k} id={`dest-${k}`} className="shrink-0" />
                      <span className="text-muted-foreground shrink-0">{ETICHETTA_DEST[k]}:</span>
                      <span className="font-medium break-all min-w-0">{cliente?.[k]}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm cursor-pointer min-h-10">
                    <RadioGroupItem value="custom" id="dest-custom" />
                    <span>Indirizzo manuale</span>
                  </label>
                </RadioGroup>
                <Input
                  type="email"
                  value={destEmail}
                  onChange={(e) => { setDestEmail(e.target.value); setDestSource("custom"); }}
                  placeholder="destinatario@esempio.it"
                />
                {destDuplicato && <p className="text-xs text-destructive">Il destinatario è già in copia: toglilo da CC o CCN.</p>}
                {senzaIndirizzo && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                    <span>Il cliente non ha nessun indirizzo email né PEC. Inserisci manualmente un indirizzo prima di inviare.</span>
                  </div>
                )}
              </Sezione>

              {/* b) Copie */}
              <Sezione titolo="Copie">
                <CampoCopie label="Copia (CC)" valori={cc} onChange={setCc} opzioni={colleghi ?? []} usati={usati} limiteRaggiunto={limiteRaggiunto} disabled={sending} />
                <CampoCopie label="Copia nascosta (CCN)" valori={bcc} onChange={setBcc} opzioni={colleghi ?? []} usati={usati} limiteRaggiunto={limiteRaggiunto} disabled={sending} />
                <p className="text-[11px] text-muted-foreground">
                  {tuttiIndirizzi.length} di {MAX_INDIRIZZI} indirizzi usati tra destinatario, copia e copia nascosta.
                </p>
              </Sezione>

              {/* c) Modalità */}
              <Sezione titolo="Testo dell'email">
                {modalita === "modello" && (
                  stadioCli ? (
                    <div className="flex flex-col gap-1.5 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">Livello attuale:</span>
                        <StadioSollecitoBadge stadio={stadioCli.stadio} data={null} giorni={null} />
                        {stadioCli.stadio > 0 && (
                          <span className="text-muted-foreground">(ultimo il {dataIt(stadioCli.stadio_data)})</span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">Proposto:</span>
                        <StadioSollecitoBadge stadio={stadioCli.livello_successivo} data={null} giorni={null} />
                      </span>
                    </div>
                  ) : !stadioPronto ? (
                    <Skeleton className="h-6 w-full max-w-md" />
                  ) : null
                )}
                <Tabs value={modalita} onValueChange={(v) => cambiaModalita(v as Modalita)}>
                  <TabsList className="grid w-full grid-cols-2 h-auto">
                    <TabsTrigger value="modello" className="min-h-9">Da modello</TabsTrigger>
                    <TabsTrigger value="libera" className="min-h-9">Libera</TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  {modalita === "modello"
                    ? "Conta come sollecito: aggiorna lo stadio del cliente (1° sollecito, 2° sollecito, messa in mora)."
                    : "Comunicazione personalizzata: non conta come sollecito."}
                </p>
                {modalita === "modello" ? (
                  <div className="space-y-1.5">
                    <Label>Modello</Label>
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Seleziona un modello..." /></SelectTrigger>
                      <SelectContent>
                        {templatesInvio.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {templates && templatesInvio.length === 0 && (
                      <p className="text-xs text-destructive">Nessun modello attivo. Creane uno in Template Email.</p>
                    )}
                    {erroreModello && <p className="text-xs text-destructive">{erroreModello}</p>}
                    {livelloScelto && livelloProposto && livelloScelto !== livelloProposto && (
                      <p className="text-xs text-muted-foreground">
                        Stai inviando {STADIO_LABEL[livelloScelto]} invece di {STADIO_LABEL[livelloProposto]}
                      </p>
                    )}
                    {stadioCli && !stadioCli.attesa_ok && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                        <span>
                          Ultimo sollecito il {dataIt(stadioCli.stadio_data)}, sono passati {stadioCli.stadio_giorni ?? 0} giorni (minimo {stadioCli.giorni_minimi}). Puoi inviare comunque.
                        </span>
                      </div>
                    )}
                    {stadioCli?.stadio === 3 && livelloScelto === 3 && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <Gavel className="size-4 mt-0.5 shrink-0" />
                        <span>
                          È la seconda messa in mora: dopo l'invio il cliente verrà proposto per il passaggio al legale (Da passare all'agenzia)
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Parti da un modello (facoltativo)</Label>
                      <Select value={baseLiberaId} onValueChange={precaricaLibera}>
                        <SelectTrigger><SelectValue placeholder="Nessuno (scrivi da zero)" /></SelectTrigger>
                        <SelectContent>
                          {templatesInvio.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Oggetto</Label>
                      <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} placeholder="Oggetto dell'email" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Testo</Label>
                      <Textarea
                        value={corpo}
                        onChange={(e) => setCorpo(e.target.value)}
                        placeholder={"Scrivi qui il messaggio.\nPlaceholder disponibili: {{ragione_sociale}}, {{totale_scaduto}}, {{elenco_scadenze}}, {{data_oggi}}, {{nome_operatore}}"}
                        rows={10}
                        className="font-mono text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Placeholder disponibili: {"{{ragione_sociale}}"}, {"{{totale_scaduto}}"}, {"{{elenco_scadenze}}"}, {"{{data_oggi}}"}, {"{{nome_operatore}}"}. Puoi usare HTML o testo: gli a capo diventano &lt;br&gt; se non è HTML.
                      </p>
                    </div>
                  </div>
                )}
              </Sezione>

              {/* d) Scadenze */}
              <Sezione titolo="Scadenze">
                {azioneEsistenteId && collegateScadute && collegateScadute.length === 0 && (
                  <p className="mb-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Le scadenze collegate a questa email non risultano più scadute
                  </p>
                )}
                {scadLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : !scadute?.length ? (
                  <p className="text-sm text-muted-foreground">Nessuna scadenza scaduta per questo cliente.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => setSelScad(selScad.size === scadute.length ? new Set() : new Set(scadute.map((s) => s.id)))}
                      >
                        {selScad.size === scadute.length ? "Deseleziona tutte" : "Seleziona tutte"}
                      </Button>
                      <span className="text-sm">
                        {selScad.size} selezionate · <strong>{formatEuro(totaleScelte)}</strong>
                      </span>
                    </div>
                    <div className="rounded-md border border-border divide-y divide-border max-h-64 overflow-y-auto">
                      {scadute.map((s) => (
                        <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer min-h-11">
                          <Checkbox
                            checked={selScad.has(s.id)}
                            onCheckedChange={(v) => {
                              const n = new Set(selScad);
                              if (v) n.add(s.id); else n.delete(s.id);
                              setSelScad(n);
                            }}
                          />
                          <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                            <span className="break-words">Doc. {s.numero_documento ?? "—"}</span>
                            <span className="text-xs text-muted-foreground sm:text-sm">Scad. {formatDateIt(s.data_scadenza)}</span>
                          </div>
                          <span className="font-medium tabular-nums shrink-0">{formatEuro(Number(s.importo_scadenza ?? 0))}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </Sezione>

              {/* e) Allegati */}
              <Sezione titolo="Allegati">
                <div className="space-y-2">
                  <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => aggiungiFile(e.target.files)} />
                  <Button type="button" variant="outline" className="gap-1.5 w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={sending}>
                    <Upload className="size-4" /> Carica dal PC
                  </Button>
                  {nuoviFile.length > 0 && (
                    <ul className="space-y-1">
                      {nuoviFile.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm rounded border border-border px-2 py-1.5">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 break-all">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{fmtMB(f.size)}</span>
                          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Togli ${f.name}`}
                            onClick={() => setNuoviFile(nuoviFile.filter((_, j) => j !== i))}>
                            <X className="size-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Dalla scheda cliente</Label>
                  {!allegatiCliente?.length ? (
                    <p className="text-sm text-muted-foreground">Nessun PDF nella scheda cliente.</p>
                  ) : (
                    <div className="rounded-md border border-border divide-y divide-border max-h-56 overflow-y-auto">
                      {allegatiCliente.map((a) => (
                        <label key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer min-h-11">
                          <Checkbox
                            className="mt-0.5"
                            checked={selAllegati.has(a.id)}
                            onCheckedChange={(v) => {
                              const n = new Set(selAllegati);
                              if (v) n.add(a.id); else n.delete(a.id);
                              setSelAllegati(n);
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="break-all font-medium">{a.nome_file}</div>
                            <div className="text-xs text-muted-foreground break-words">
                              {formatDateIt(a.created_at)}
                              {a.dimensione_bytes ? ` · ${fmtMB(a.dimensione_bytes)}` : ""}
                              {a.descrizione ? ` · ${a.descrizione}` : ""}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-md border border-border p-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer min-h-10">
                    <span className="text-sm font-medium">Allega lettera PDF</span>
                    <Switch checked={letteraOn} onCheckedChange={setLetteraOn} />
                  </label>
                  {letteraOn && (
                    <div className="space-y-3">
                      <Select value={letteraTplId} onValueChange={setLetteraTplId} disabled={lettLoading}>
                        <SelectTrigger><SelectValue placeholder={lettLoading ? "Caricamento…" : "Scegli un modello di lettera"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={LETTERA_LIBERA}>— Modalità libera (senza modello) —</SelectItem>
                          {(templatesLettera ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="space-y-1.5">
                        <Label>Oggetto lettera</Label>
                        <Input value={letteraOggetto} onChange={(e) => setLetteraOggetto(e.target.value)} disabled={!letteraTplId} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Testo lettera</Label>
                        <Textarea value={letteraCorpo} onChange={(e) => setLetteraCorpo(e.target.value)} rows={10}
                          className="font-mono text-xs" disabled={!letteraTplId}
                          placeholder="Seleziona un modello per caricare il testo" />
                      </div>
                    </div>
                  )}
                </div>

                <p className={`text-sm ${oltreLimite ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  Totale allegati: {fmtMB(bytesTotali)} di 10 MB
                  {letteraOn ? " (lettera esclusa, calcolata all'invio)" : ""}
                  {oltreLimite ? " — limite superato, togli qualche file." : ""}
                </p>
              </Sezione>

              {/* f) Promemoria */}
              <Sezione titolo="Promemoria di richiamo">
                <ReminderControls tipo="email" state={reminder} onChange={setReminder} />
              </Sezione>

              {/* g) Anteprima */}
              <Sezione titolo="Anteprima">
                {!rendered ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground mb-1">Oggetto</div>
                      <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm break-words">
                        {rendered.oggetto || <em className="text-muted-foreground">(vuoto)</em>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground mb-1">Corpo</div>
                      <div
                        className="rounded border border-border bg-background px-3 sm:px-4 py-3 text-sm max-h-80 overflow-auto"
                        dangerouslySetInnerHTML={{ __html: rendered.corpo }}
                      />
                    </div>
                  </>
                )}
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">A</dt>
                  <dd className="break-all">{dest || "—"}</dd>
                  <dt className="text-muted-foreground">CC</dt>
                  <dd className="break-all">{cc.length ? cc.join(", ") : "—"}</dd>
                  <dt className="text-muted-foreground">CCN</dt>
                  <dd className="break-all">{bcc.length ? bcc.join(", ") : "—"}</dd>
                  <dt className="text-muted-foreground">Allegati</dt>
                  <dd className="break-all">
                    {[
                      ...nuoviFile.map((f) => f.name),
                      ...(allegatiCliente ?? []).filter((a) => selAllegati.has(a.id)).map((a) => a.nome_file),
                      ...(letteraOn ? ["Lettera PDF"] : []),
                    ].join(", ") || "—"}
                  </dd>
                </dl>
              </Sezione>
            </div>

            {bloccoSenzaScaduto && (
              <p className="shrink-0 border-t border-border px-4 pt-2 sm:px-6 text-xs text-destructive">
                Seleziona almeno una fattura scaduta: il sollecito deve essere collegato alle fatture per contare nella scala
              </p>
            )}
            <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6 gap-2 flex-col-reverse sm:flex-row [&>button]:w-full sm:[&>button]:w-auto">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Annulla</Button>
              <Button onClick={handleInvia} disabled={!puoInviareOra} className="gap-1.5">
                <Send className="size-4" /> {sending ? "Invio in corso..." : "Invia"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
