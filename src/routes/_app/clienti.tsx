import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, Building, MapPin, FileCheck2, FileX2, ArrowLeft, ArrowRight, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SignaturePad, getCanvasDataURL } from "@/components/signature-pad";
import { generaSchedaCliente } from "@/lib/scheda-pdf";
import { generaPdfPrivacy } from "@/lib/privacy-pdf";

function splitNomeCognome(full: string): { nome: string; cognome: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { nome: "", cognome: "" };
  if (parts.length === 1) return { nome: parts[0], cognome: "" };
  return { nome: parts[0], cognome: parts.slice(1).join(" ") };
}

export const Route = createFileRoute("/_app/clienti")({
  component: ClientiPage,
});

type SemaforoColor = "rosso" | "arancione" | "giallo" | "verde";

function calcSemaforo(c: {
  fido_residuo?: number | null;
  fido_gestionale?: number | null;
  scaduto?: number | null;
}): SemaforoColor {
  const residuo = c.fido_residuo == null ? null : Number(c.fido_residuo);
  const fidoGest = c.fido_gestionale == null ? null : Number(c.fido_gestionale);
  const scaduto = c.scaduto == null ? null : Number(c.scaduto);
  if (residuo != null && residuo < 0) return "rosso";
  if (residuo != null && fidoGest != null && fidoGest > 0 && residuo < fidoGest * 0.1) return "arancione";
  if (scaduto != null && scaduto > 0) return "giallo";
  return "verde";
}

const SEMAFORO_DOT: Record<SemaforoColor, string> = {
  rosso: "bg-destructive",
  arancione: "bg-orange-500",
  giallo: "bg-yellow-500",
  verde: "bg-success",
};

const SEMAFORO_LABEL: Record<SemaforoColor, string> = {
  rosso: "Rischio critico",
  arancione: "Fido quasi esaurito",
  giallo: "Scaduto presente",
  verde: "Posizione regolare",
};

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function ClientiPage() {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isListRoute = currentPath === "/clienti";
  const [search, setSearch] = useState("");
  const [statoFiltro, setStatoFiltro] = useState<"attivi" | "disattivati" | "tutti">("attivi");
  const [open, setOpen] = useState(false);

  const { data: clienti, isLoading } = useQuery({
    queryKey: ["clienti"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti")
        .select("*, stores(nome, codice)")
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: isListRoute,
  });

  const filtered = (clienti ?? []).filter((c) => {
    if (statoFiltro === "attivi" && !c.attivo) return false;
    if (statoFiltro === "disattivati" && c.attivo) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.ragione_sociale?.toLowerCase().includes(q) ||
      c.partita_iva?.toLowerCase().includes(q) ||
      (c as any).codice_gestionale?.toLowerCase().includes(q) ||
      c.citta?.toLowerCase().includes(q)
    );
  });

  if (!isListRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anagrafica dei clienti dei punti vendita
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nuova scheda cliente
            </Button>
          </DialogTrigger>
          <SchedaClienteDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per ragione sociale, P.IVA, codice gestionale o città..."
              className="pl-9"
            />
          </div>
          <Select value={statoFiltro} onValueChange={(v) => setStatoFiltro(v as typeof statoFiltro)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attivi">Solo attivi</SelectItem>
              <SelectItem value="disattivati">Solo disattivati</SelectItem>
              <SelectItem value="tutti">Tutti</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Building className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessun cliente trovato</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Prova un'altra ricerca" : "Inizia compilando la prima scheda cliente"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Ragione sociale</TableHead>
                  <TableHead>Cod. gest.</TableHead>
                  <TableHead>P. IVA</TableHead>
                  <TableHead>Città</TableHead>
                  <TableHead>Punto vendita</TableHead>
                  <TableHead className="text-right">Fido residuo</TableHead>
                  <TableHead>Privacy</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const sem = calcSemaforo(c as any);
                  const residuo = (c as any).fido_residuo;
                  const residuoNum = residuo == null ? null : Number(residuo);
                  return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: c.id } })}
                  >
                    <TableCell>
                      <span
                        className={`inline-block size-2.5 rounded-full ${SEMAFORO_DOT[sem]}`}
                        title={SEMAFORO_LABEL[sem]}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {c.ragione_sociale}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {(c as any).codice_gestionale || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.partita_iva || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.citta ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 text-muted-foreground" />
                          {c.citta} {c.provincia ? `(${c.provincia})` : ""}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(c as any).stores?.nome || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${residuoNum != null && residuoNum < 0 ? "text-destructive" : ""}`}>
                      {fmtEuro(residuo)}
                    </TableCell>
                    <TableCell>
                      {c.privacy_firmata ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/20 gap-1">
                          <FileCheck2 className="size-3" /> Firmata
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <FileX2 className="size-3" /> Da firmare
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.attivo ? "default" : "secondary"}>
                        {c.attivo ? "Attivo" : "Inattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifica"
                        onClick={() => navigate({
                          to: "/clienti/$clienteId",
                          params: { clienteId: c.id },
                          search: { edit: 1 } as any,
                        })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// WIZARD SCHEDA CLIENTE
// ============================================================================

const schedaSchema = z.object({
  tipo: z.enum(["nuovo", "aggiornamento"]),
  tipo_soggetto: z.enum(["persona_fisica", "azienda"]),
  ragione_sociale: z.string().trim().min(1, "Obbligatorio").max(200),
  codice_gestionale: z.string().trim().max(50).optional().or(z.literal("")),
  indirizzo: z.string().trim().max(200).optional().or(z.literal("")),
  cap: z.string().trim().max(10).optional().or(z.literal("")),
  citta: z.string().trim().max(100).optional().or(z.literal("")),
  provincia: z.string().trim().max(2).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email non valida").max(255).optional().or(z.literal("")),
  partita_iva: z.string().trim().max(20).optional().or(z.literal("")),
  codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  banca: z.string().trim().max(120).optional().or(z.literal("")),
  agenzia: z.string().trim().max(120).optional().or(z.literal("")),
  abi: z.string().trim().max(20).optional().or(z.literal("")),
  cab: z.string().trim().max(20).optional().or(z.literal("")),
  codice_sdi: z.string().trim().max(20).optional().or(z.literal("")),
  pec: z.string().trim().max(255).optional().or(z.literal("")),
  store_id: z.string().uuid().optional().or(z.literal("")),
  // Contatti
  titolare_nome: z.string().trim().max(150).optional().or(z.literal("")),
  titolare_email: z.string().trim().max(255).optional().or(z.literal("")),
  titolare_cell: z.string().trim().max(30).optional().or(z.literal("")),
  amministrativo_nome: z.string().trim().max(150).optional().or(z.literal("")),
  amministrativo_email: z.string().trim().max(255).optional().or(z.literal("")),
  amministrativo_cell: z.string().trim().max(30).optional().or(z.literal("")),
  // Dichiarante
  dichiarante_nome: z.string().trim().min(1, "Obbligatorio").max(100),
  dichiarante_cognome: z.string().trim().min(1, "Obbligatorio").max(100),
});

type SchedaForm = z.infer<typeof schedaSchema>;

const emptyForm: SchedaForm = {
  tipo: "nuovo",
  tipo_soggetto: "azienda",
  ragione_sociale: "",
  codice_gestionale: "",
  indirizzo: "", cap: "", citta: "", provincia: "",
  telefono: "", email: "",
  partita_iva: "", codice_fiscale: "",
  banca: "", agenzia: "", abi: "", cab: "",
  codice_sdi: "", pec: "",
  store_id: "",
  titolare_nome: "", titolare_email: "", titolare_cell: "",
  amministrativo_nome: "", amministrativo_email: "", amministrativo_cell: "",
  dichiarante_nome: "", dichiarante_cognome: "",
};

const STEPS = ["Impresa", "Banca / Fatt. elettronica", "Contatti", "Dichiarante e firma"] as const;

function SchedaClienteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SchedaForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  function set<K extends keyof SchedaForm>(k: K, v: SchedaForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.ragione_sociale.trim()) errs.ragione_sociale = "Obbligatorio";
      if (form.email && !z.string().email().safeParse(form.email).success) errs.email = "Email non valida";
    }
    if (s === 2) {
      if (!(form.titolare_nome ?? "").trim())
        errs.titolare_nome = "Nominativo Titolare obbligatorio (sarà il firmatario)";
    }
    if (s === 3) {
      if (!form.dichiarante_nome.trim()) errs.dichiarante_nome = "Obbligatorio";
      if (!form.dichiarante_cognome.trim()) errs.dichiarante_cognome = "Obbligatorio";
      if (!hasSig) errs.firma = "Firma obbligatoria";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Auto-precompila dichiarante dal Titolare al passaggio step 2 → 3
  const goNext = () => {
    if (!validateStep(step)) return;
    if (step === 2) {
      const { nome, cognome } = splitNomeCognome(form.titolare_nome ?? "");
      setForm((f) => ({ ...f, dichiarante_nome: nome, dichiarante_cognome: cognome }));
    }
    setStep((s) => s + 1);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schedaSchema.parse(form);
      const dataUrl = padRef.current ? getCanvasDataURL(padRef.current) : null;
      if (!dataUrl) throw new Error("Inserisci la firma");
      if (!(parsed.titolare_nome ?? "").trim())
        throw new Error("Nominativo Titolare obbligatorio");

      const now = new Date();
      const { data: { user } } = await supabase.auth.getUser();

      // Tracker per rollback in caso di errore in qualunque step successivo
      let clienteId: string | null = null;
      const uploadedPaths: Array<{ bucket: string; path: string }> = [];

      const rollback = async (reason: string) => {
        try {
          for (const u of uploadedPaths) {
            await supabase.storage.from(u.bucket).remove([u.path]);
          }
          if (clienteId) {
            await supabase.from("contatti").delete().eq("cliente_id", clienteId);
            await supabase.from("clienti").delete().eq("id", clienteId);
          }
        } catch {
          // best-effort rollback; non sovrascrive l'errore originale
        }
        throw new Error(reason);
      };

      try {
        // 1. INSERT cliente
        const clientePayload: Record<string, unknown> = {
          ragione_sociale: parsed.ragione_sociale,
          tipo_soggetto: parsed.tipo_soggetto,
          codice_gestionale: parsed.codice_gestionale || null,
          partita_iva: parsed.partita_iva || null,
          codice_fiscale: parsed.codice_fiscale || null,
          indirizzo: parsed.indirizzo || null,
          cap: parsed.cap || null,
          citta: parsed.citta || null,
          provincia: parsed.provincia || null,
          telefono: parsed.telefono || null,
          email: parsed.email || null,
          banca: parsed.banca || null,
          agenzia: parsed.agenzia || null,
          abi: parsed.abi || null,
          cab: parsed.cab || null,
          codice_sdi: parsed.codice_sdi || null,
          pec: parsed.pec || null,
          store_id: parsed.store_id || null,
          dichiarante_nome: parsed.dichiarante_nome,
          dichiarante_cognome: parsed.dichiarante_cognome,
          created_by: user?.id,
        };
        const { data: cliente, error: e1 } = await supabase
          .from("clienti").insert(clientePayload as never).select("id").single();
        if (e1) throw e1;
        clienteId = (cliente as { id: string }).id;

        // 2. Upload firma PNG (in bucket "firme", path per contatto Titolare)
        const pngBlob = await (await fetch(dataUrl)).blob();
        const firmaPath = `contatti/${clienteId}/firma-${now.getTime()}.png`;
        const { error: e2 } = await supabase.storage.from("firme")
          .upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
        if (e2) throw new Error(`Upload firma: ${e2.message}`);
        uploadedPaths.push({ bucket: "firme", path: firmaPath });
        const { data: firmaUrl } = supabase.storage.from("firme").getPublicUrl(firmaPath);

        // 3. Genera PDF privacy del Titolare (firmatario)
        const titolareFull = (parsed.titolare_nome ?? "").trim();
        const { nome: titNome, cognome: titCognome } = splitNomeCognome(titolareFull);
        const pdfPrivacyBytes = await generaPdfPrivacy({
          ragioneSociale: `${parsed.ragione_sociale} — firma di ${titolareFull}`,
          partitaIva: parsed.partita_iva || null,
          codiceFiscale: parsed.codice_fiscale || null,
          indirizzo: parsed.indirizzo || null,
          citta: parsed.citta || null,
          email: parsed.titolare_email || parsed.email || null,
          firmaPngDataUrl: dataUrl,
          dataFirma: now,
        });
        const pdfPrivacyPath = `contatti/${clienteId}/privacy-${now.getTime()}.pdf`;
        const { error: ePdfPriv } = await supabase.storage.from("documenti-privacy")
          .upload(pdfPrivacyPath, pdfPrivacyBytes, { contentType: "application/pdf", upsert: true });
        if (ePdfPriv) throw new Error(`Upload PDF privacy: ${ePdfPriv.message}`);
        uploadedPaths.push({ bucket: "documenti-privacy", path: pdfPrivacyPath });
        const { data: pdfPrivacyUrl } = supabase.storage.from("documenti-privacy").getPublicUrl(pdfPrivacyPath);

        // 4. Genera PDF scheda cliente
        const pdfBytes = await generaSchedaCliente({
          tipo: parsed.tipo,
          tipoSoggetto: parsed.tipo_soggetto,
          ragioneSociale: parsed.ragione_sociale,
          indirizzo: parsed.indirizzo,
          cap: parsed.cap,
          citta: parsed.citta,
          provincia: parsed.provincia,
          telefono: parsed.telefono,
          email: parsed.email,
          partitaIva: parsed.partita_iva,
          codiceFiscale: parsed.codice_fiscale,
          banca: parsed.banca,
          agenzia: parsed.agenzia,
          abi: parsed.abi,
          cab: parsed.cab,
          codiceSdi: parsed.codice_sdi,
          pec: parsed.pec,
          codiceGestionale: parsed.codice_gestionale,
          titolareNome: parsed.titolare_nome,
          titolareEmail: parsed.titolare_email,
          titolareCell: parsed.titolare_cell,
          amministrativoNome: parsed.amministrativo_nome,
          amministrativoEmail: parsed.amministrativo_email,
          amministrativoCell: parsed.amministrativo_cell,
          dichiaranteNome: parsed.dichiarante_nome,
          dichiaranteCognome: parsed.dichiarante_cognome,
          firmaPngDataUrl: dataUrl,
          dataFirma: now,
        });
        const schedaPath = `${clienteId}/scheda-${now.getTime()}.pdf`;
        const { error: e3 } = await supabase.storage.from("schede-clienti")
          .upload(schedaPath, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (e3) throw new Error(`Upload scheda: ${e3.message}`);
        uploadedPaths.push({ bucket: "schede-clienti", path: schedaPath });
        const { data: schedaSigned } = await supabase.storage.from("schede-clienti")
          .createSignedUrl(schedaPath, 60 * 60 * 24 * 365 * 5);

        // 5. UPDATE cliente con riepilogo firma + scheda url
        const { error: e4 } = await supabase.from("clienti").update({
          privacy_firmata: true,
          data_firma: now.toISOString(),
          firma_url: firmaUrl.publicUrl,
          scheda_pdf_url: schedaSigned?.signedUrl ?? null,
        } as never).eq("id", clienteId);
        if (e4) throw new Error(`Aggiornamento cliente: ${e4.message}`);

        // 6. INSERT contatti — Titolare (con firma+PDF) e Referente Amm.vo (opzionale)
        const contattiToInsert: Array<Record<string, unknown>> = [];

        contattiToInsert.push({
          cliente_id: clienteId,
          nome: titNome,
          cognome: titCognome || null,
          ruolo: "Titolare / Legale Rappresentante",
          email: parsed.titolare_email || null,
          cellulare: parsed.titolare_cell || null,
          principale: true,
          privacy_firmata: true,
          data_firma: now.toISOString(),
          firma_url: firmaUrl.publicUrl,
          pdf_privacy_url: pdfPrivacyUrl.publicUrl,
          pdf_privacy_path: pdfPrivacyPath,
        });

        if ((parsed.amministrativo_nome ?? "").trim()) {
          const { nome, cognome } = splitNomeCognome(parsed.amministrativo_nome ?? "");
          contattiToInsert.push({
            cliente_id: clienteId,
            nome,
            cognome: cognome || null,
            ruolo: "Referente Amministrativo",
            email: parsed.amministrativo_email || null,
            cellulare: parsed.amministrativo_cell || null,
            principale: false,
          });
        }

        const { error: e5 } = await supabase.from("contatti").insert(contattiToInsert as never);
        if (e5) throw new Error(`Salvataggio contatti: ${e5.message}`);

        return clienteId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Errore durante il salvataggio";
        await rollback(msg);
        return null; // unreachable: rollback throws
      }
    },
    onSuccess: () => {
      toast.success("Scheda cliente creata e firmata");
      qc.invalidateQueries({ queryKey: ["clienti"] });
      onClose();
    },
    onError: (err: any) => {
      const code = err?.code ?? "";
      const msg = err?.message ?? "";
      if (code === "23505" || msg.includes("clienti_codice_gestionale_unique")) {
        toast.error("Codice gestionale già utilizzato da un altro cliente. Inseriscine uno diverso o lascialo vuoto.");
        setStep(0);
        return;
      }
      toast.error(msg || "Errore durante il salvataggio");
    },
  });

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Scheda inserimento cliente</DialogTitle>
        <DialogDescription>
          Step {step + 1} di {STEPS.length} — {STEPS[step]}
        </DialogDescription>
      </DialogHeader>

      {/* Progress */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="space-y-4 mt-2">
        {step === 0 && (
          <StepImpresa form={form} set={set} errors={errors} stores={stores ?? []} />
        )}
        {step === 1 && <StepBanca form={form} set={set} />}
        {step === 2 && <StepContatti form={form} set={set} />}
        {step === 3 && (
          <StepDichiarante
            form={form} set={set} errors={errors}
            padRef={padRef} setHasSig={setHasSig}
          />
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4 mr-1" /> Indietro
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Avanti <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={submit.isPending}
            onClick={() => { if (validateStep(3)) submit.mutate(); }}
          >
            {submit.isPending ? "Salvataggio..." : (<><Check className="size-4 mr-1" /> Crea scheda e firma</>)}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

type SetFn = <K extends keyof SchedaForm>(k: K, v: SchedaForm[K]) => void;

function StepImpresa({
  form, set, errors, stores,
}: { form: SchedaForm; set: SetFn; errors: Record<string, string>; stores: Array<{ id: string; nome: string; codice: string }> }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo modulo</Label>
          <RadioGroup value={form.tipo} onValueChange={(v) => set("tipo", v as SchedaForm["tipo"])} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="nuovo" /> Nuovo inserimento
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="aggiornamento" /> Aggiornamento
            </label>
          </RadioGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo soggetto</Label>
          <RadioGroup value={form.tipo_soggetto} onValueChange={(v) => set("tipo_soggetto", v as SchedaForm["tipo_soggetto"])} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="persona_fisica" /> Persona fisica
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="azienda" /> Azienda
            </label>
          </RadioGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Ragione sociale / Nominativo *</Label>
          <Input value={form.ragione_sociale} onChange={(e) => set("ragione_sociale", e.target.value)} />
          {errors.ragione_sociale && <p className="text-xs text-destructive">{errors.ragione_sociale}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Codice gestionale</Label>
          <Input value={form.codice_gestionale} onChange={(e) => set("codice_gestionale", e.target.value)} placeholder="es. 00123" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Indirizzo</Label>
        <Input value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>CAP</Label>
          <Input value={form.cap} onChange={(e) => set("cap", e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Città</Label>
          <Input value={form.citta} onChange={(e) => set("citta", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Prov.</Label>
          <Input maxLength={2} value={form.provincia} onChange={(e) => set("provincia", e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Telefono</Label>
          <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Partita IVA</Label>
          <Input value={form.partita_iva} onChange={(e) => set("partita_iva", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Codice fiscale</Label>
          <Input value={form.codice_fiscale} onChange={(e) => set("codice_fiscale", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Punto vendita</Label>
        <Select value={form.store_id || undefined} onValueChange={(v) => set("store_id", v)}>
          <SelectTrigger><SelectValue placeholder={stores.length ? "Seleziona..." : "Nessuno disponibile"} /></SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.codice} — {s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function StepBanca({ form, set }: { form: SchedaForm; set: SetFn }) {
  return (
    <>
      <h3 className="font-semibold text-sm">Dati bancari</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Banca</Label>
          <Input value={form.banca} onChange={(e) => set("banca", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>ABI</Label>
          <Input value={form.abi} onChange={(e) => set("abi", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Agenzia</Label>
          <Input value={form.agenzia} onChange={(e) => set("agenzia", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CAB</Label>
          <Input value={form.cab} onChange={(e) => set("cab", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-2">Fatturazione elettronica</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice SDI</Label>
          <Input value={form.codice_sdi} onChange={(e) => set("codice_sdi", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>PEC</Label>
          <Input type="email" value={form.pec} onChange={(e) => set("pec", e.target.value)} />
        </div>
      </div>
    </>
  );
}

function StepContatti({ form, set }: { form: SchedaForm; set: SetFn }) {
  return (
    <>
      <h3 className="font-semibold text-sm">Titolare / Legale Rappresentante</h3>
      <div className="space-y-1.5">
        <Label>Nominativo</Label>
        <Input value={form.titolare_nome} onChange={(e) => set("titolare_nome", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.titolare_email} onChange={(e) => set("titolare_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cell.</Label>
          <Input value={form.titolare_cell} onChange={(e) => set("titolare_cell", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-3">Referente Amministrativo <span className="text-muted-foreground font-normal">(se diverso dal Titolare)</span></h3>
      <div className="space-y-1.5">
        <Label>Nominativo</Label>
        <Input value={form.amministrativo_nome} onChange={(e) => set("amministrativo_nome", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.amministrativo_email} onChange={(e) => set("amministrativo_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cell.</Label>
          <Input value={form.amministrativo_cell} onChange={(e) => set("amministrativo_cell", e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        I contatti compilati saranno automaticamente collegati al cliente nella sezione "Contatti".
      </p>
    </>
  );
}

function StepDichiarante({
  form, set, errors, padRef, setHasSig,
}: {
  form: SchedaForm; set: SetFn; errors: Record<string, string>;
  padRef: React.RefObject<HTMLDivElement | null>; setHasSig: (b: boolean) => void;
}) {
  return (
    <>
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Firmatario (Titolare / Legale Rappresentante)</p>
        <p className="text-muted-foreground">
          I dati sono precompilati dallo Step 3. Per modificarli torna allo step "Contatti".
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome dichiarante *</Label>
          <Input value={form.dichiarante_nome} readOnly disabled className="bg-muted/50" />
          {errors.dichiarante_nome && <p className="text-xs text-destructive">{errors.dichiarante_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome dichiarante *</Label>
          <Input value={form.dichiarante_cognome} readOnly disabled className="bg-muted/50" />
          {errors.dichiarante_cognome && <p className="text-xs text-destructive">{errors.dichiarante_cognome}</p>}
        </div>
      </div>


      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
        In relazione al nuovo Regolamento UE 679/2016, ed ai sensi del decreto legislativo 196 del 30/06/2003, i dati personali
        forniti verranno trattati per le finalità relative alla gestione del rapporto in essere, non verranno comunicati ad
        altri soggetti e potranno essere utilizzati per l'invio della corrispondenza. L'interessato potrà chiedere in ogni
        momento la modifica o la cancellazione dei propri dati ai sensi degli artt. 14-17 del Reg. UE 679/2016.
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
