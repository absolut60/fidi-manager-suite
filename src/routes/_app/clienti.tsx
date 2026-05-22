import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, Building, MapPin, FileCheck2, FileX2, ArrowLeft, ArrowRight, Check, Pencil, PenTool, FileText, SlidersHorizontal, X, AlertCircle, Clock, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { useAuth } from "@/hooks/use-auth";

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
  const [statoCliente, setStatoCliente] = useState<"attivi" | "disattivati" | "tutti">("attivi");
  const [storeFiltro, setStoreFiltro] = useState<string>("tutti");
  const [statoFido, setStatoFido] = useState<Set<string>>(new Set());
  const [semaforoFiltro, setSemaforoFiltro] = useState<string>("tutti");
  const [soloBloccati, setSoloBloccati] = useState(false);
  const [privacyFiltro, setPrivacyFiltro] = useState<string>("tutti");
  const [soloAssicurati, setSoloAssicurati] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: clientiResp, isLoading } = useQuery({
    queryKey: ["clienti", { search, statoCliente, storeFiltro, soloBloccati, privacyFiltro, soloAssicurati }],
    queryFn: async () => {
      let q = supabase
        .from("clienti")
        .select("*, stores(nome, codice)", { count: "exact" })
        .order("ragione_sociale", { ascending: true })
        .range(0, 4999);

      if (statoCliente === "attivi") q = q.eq("attivo", true);
      else if (statoCliente === "disattivati") q = q.eq("attivo", false);
      if (storeFiltro !== "tutti") q = q.eq("store_id", storeFiltro);
      if (soloBloccati) q = q.eq("bloccato", true);
      if (privacyFiltro === "firmata") q = q.eq("privacy_firmata", true);
      else if (privacyFiltro === "da_firmare") q = q.eq("privacy_firmata", false);
      if (soloAssicurati) q = q.eq("assicurazione_attiva", true);
      const term = search.replace(/[(),]/g, " ").trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(
          `ragione_sociale.ilike.${like},partita_iva.ilike.${like},codice_gestionale.ilike.${like},citta.ilike.${like}`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? (data?.length ?? 0) };
    },
    enabled: isListRoute,
  });
  const clienti = clientiResp?.rows;
  const totaleClienti = clientiResp?.count ?? 0;

  // Filtri derivati lato client (stato fido + semaforo non sono campi DB diretti)
  const filtered = useMemo(() => {
    return (clienti ?? []).filter((c: any) => {
      if (semaforoFiltro !== "tutti" && calcSemaforo(c) !== semaforoFiltro) return false;
      if (statoFido.size > 0) {
        const fido = Number(c.fido ?? 0);
        const scaduto = Number(c.scaduto ?? 0);
        const matches = new Set<string>();
        if (c.bloccato) matches.add("sospeso");
        if (scaduto > 0) matches.add("scaduto");
        if (!fido) matches.add("non_assegnato");
        else if (!c.bloccato && scaduto === 0) matches.add("attivo");
        // "in_revisione" non ricavabile direttamente dai campi del cliente
        const intersect = Array.from(statoFido).some((s) => matches.has(s));
        if (!intersect) return false;
      }
      return true;
    });
  }, [clienti, semaforoFiltro, statoFido]);

  const attiviCount =
    (search ? 1 : 0) +
    (statoCliente !== "attivi" ? 1 : 0) +
    (storeFiltro !== "tutti" ? 1 : 0) +
    (statoFido.size > 0 ? 1 : 0) +
    (semaforoFiltro !== "tutti" ? 1 : 0) +
    (soloBloccati ? 1 : 0) +
    (privacyFiltro !== "tutti" ? 1 : 0) +
    (soloAssicurati ? 1 : 0);

  function resetFiltri() {
    setSearch("");
    setStatoCliente("attivi");
    setStoreFiltro("tutti");
    setStatoFido(new Set());
    setSemaforoFiltro("tutti");
    setSoloBloccati(false);
    setPrivacyFiltro("tutti");
    setSoloAssicurati(false);
  }

  const STATO_FIDO_OPTS: Array<{ value: string; label: string }> = [
    { value: "attivo", label: "Attivo" },
    { value: "scaduto", label: "Scaduto" },
    { value: "in_revisione", label: "In revisione" },
    { value: "sospeso", label: "Sospeso" },
    { value: "non_assegnato", label: "Non assegnato" },
  ];

  function toggleStatoFido(v: string) {
    setStatoFido((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  function FiltriContent({ stack = false }: { stack?: boolean }) {
    const wrap = stack ? "grid grid-cols-1 gap-3" : "flex flex-wrap gap-3 items-center";
    return (
      <div className={wrap}>
        {!stack && (
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca ragione sociale, P.IVA, cod. gest., città..."
              className="pl-9"
            />
          </div>
        )}

        <Select value={storeFiltro} onValueChange={setStoreFiltro}>
          <SelectTrigger className={stack ? "w-full" : "w-48"}><SelectValue placeholder="Punto vendita" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i punti vendita</SelectItem>
            {(stores ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={stack ? "w-full justify-between" : "w-48 justify-between"}>
              <span className="truncate">
                {statoFido.size === 0 ? "Stato fido" : `Stato fido (${statoFido.size})`}
              </span>
              <SlidersHorizontal className="size-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            {STATO_FIDO_OPTS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={statoFido.has(o.value)} onCheckedChange={() => toggleStatoFido(o.value)} />
                {o.label}
              </label>
            ))}
            {statoFido.size > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => setStatoFido(new Set())}>
                Pulisci
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Select value={semaforoFiltro} onValueChange={setSemaforoFiltro}>
          <SelectTrigger className={stack ? "w-full" : "w-40"}><SelectValue placeholder="Semaforo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i semafori</SelectItem>
            <SelectItem value="verde">🟢 Verde</SelectItem>
            <SelectItem value="giallo">🟡 Giallo</SelectItem>
            <SelectItem value="arancione">🟠 Arancione</SelectItem>
            <SelectItem value="rosso">🔴 Rosso</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statoCliente} onValueChange={(v) => setStatoCliente(v as typeof statoCliente)}>
          <SelectTrigger className={stack ? "w-full" : "w-40"}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="attivi">Solo attivi</SelectItem>
            <SelectItem value="disattivati">Solo disattivati</SelectItem>
            <SelectItem value="tutti">Tutti</SelectItem>
          </SelectContent>
        </Select>

        <Select value={privacyFiltro} onValueChange={setPrivacyFiltro}>
          <SelectTrigger className={stack ? "w-full" : "w-44"}><SelectValue placeholder="Privacy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Privacy: tutti</SelectItem>
            <SelectItem value="firmata">Privacy firmata</SelectItem>
            <SelectItem value="da_firmare">Privacy da firmare</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm px-2 py-1 cursor-pointer whitespace-nowrap">
          <Checkbox checked={soloBloccati} onCheckedChange={(v) => setSoloBloccati(!!v)} />
          Solo bloccati
        </label>

        <label className="flex items-center gap-2 text-sm px-2 py-1 cursor-pointer whitespace-nowrap">
          <Checkbox checked={soloAssicurati} onCheckedChange={(v) => setSoloAssicurati(!!v)} />
          Solo assicurati POUEY
        </label>

        {attiviCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFiltri} className="gap-1">
            <X className="size-4" /> Azzera filtri
          </Button>
        )}
      </div>
    );
  }

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
          <SchedaClienteDialog onClose={() => { setOpen(false); setSearch(""); }} />
        </Dialog>
      </div>

      <Card className="p-4 sm:p-5">
        {/* Desktop: barra filtri inline */}
        <div className="hidden md:block mb-4">
          <FiltriContent />
        </div>

        {/* Mobile: search inline + bottone "Filtri" con badge */}
        <div className="md:hidden flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cliente..."
              className="pl-9"
            />
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-1.5 relative">
                <SlidersHorizontal className="size-4" />
                Filtri
                {attiviCount > 0 && (
                  <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-xs">{attiviCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtri</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <FiltriContent stack />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="mb-3 text-sm text-muted-foreground">
          <strong className="text-foreground">{filtered.length}</strong> clienti trovati
          {attiviCount > 0 && <span className="ml-1">(filtri attivi: {attiviCount})</span>}
          <span className="ml-2">· Totale in archivio: <strong className="text-foreground">{totaleClienti}</strong></span>
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
// WIZARD SCHEDA CLIENTE — Modalità "Crea con firma" / "Crea senza firma"
// ============================================================================

const schedaSchema = z.object({
  tipo: z.enum(["nuovo", "aggiornamento"]),
  tipo_soggetto: z.enum(["persona_fisica", "azienda"]),
  // STEP 1 — Impresa
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
  // STEP 2 — Contatti (nome/cognome separati)
  titolare_nome: z.string().trim().max(100).optional().or(z.literal("")),
  titolare_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  titolare_email: z.string().trim().max(255).optional().or(z.literal("")),
  titolare_cell: z.string().trim().max(30).optional().or(z.literal("")),
  amministrativo_nome: z.string().trim().max(100).optional().or(z.literal("")),
  amministrativo_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  amministrativo_email: z.string().trim().max(255).optional().or(z.literal("")),
  amministrativo_cell: z.string().trim().max(30).optional().or(z.literal("")),
  // STEP 3 — Amministrazione (admin/approvatori)
  codice_assegnato: z.string().trim().max(50).optional().or(z.literal("")),
  sede_operatore: z.string().trim().max(100).optional().or(z.literal("")),
  condizioni_pagamento_concordate: z.string().trim().max(200).optional().or(z.literal("")),
  data_richiesta_affidamento: z.string().optional().or(z.literal("")),
  importo_affidamento_richiesto: z.string().optional().or(z.literal("")),
  note_amministrazione: z.string().trim().max(2000).optional().or(z.literal("")),
  // STEP 4 — Firma (solo modalità con firma)
  dichiarante_nome: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_cognome: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_societa: z.string().trim().max(200).optional().or(z.literal("")),
  dichiarante_luogo_nascita: z.string().trim().max(100).optional().or(z.literal("")),
  dichiarante_data_nascita: z.string().optional().or(z.literal("")),
  dichiarante_codice_fiscale: z.string().trim().max(20).optional().or(z.literal("")),
  dichiarante_residenza: z.string().trim().max(200).optional().or(z.literal("")),
  dichiarante_email: z.string().trim().max(255).optional().or(z.literal("")),
  dichiarante_cell: z.string().trim().max(30).optional().or(z.literal("")),
  dichiarante_data_firma: z.string().optional().or(z.literal("")),
  consenso_profilazione: z.enum(["", "si", "no"]).optional().default(""),
  consenso_marketing_media: z.enum(["", "si", "no"]).optional().default(""),
  consenso_marketing_diretto: z.enum(["", "si", "no"]).optional().default(""),
  whatsapp_opt_in: z.boolean().optional().default(false),
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
  titolare_nome: "", titolare_cognome: "", titolare_email: "", titolare_cell: "",
  amministrativo_nome: "", amministrativo_cognome: "", amministrativo_email: "", amministrativo_cell: "",
  codice_assegnato: "", sede_operatore: "", condizioni_pagamento_concordate: "",
  data_richiesta_affidamento: "", importo_affidamento_richiesto: "",
  note_amministrazione: "",
  dichiarante_nome: "", dichiarante_cognome: "",
  dichiarante_societa: "", dichiarante_luogo_nascita: "", dichiarante_data_nascita: "",
  dichiarante_codice_fiscale: "", dichiarante_residenza: "",
  dichiarante_email: "", dichiarante_cell: "", dichiarante_data_firma: "",
  consenso_profilazione: "", consenso_marketing_media: "", consenso_marketing_diretto: "",
  whatsapp_opt_in: false,
};

type ModalitaCreazione = "con_firma" | "senza_firma" | null;

function SchedaClienteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const canSeeAdminStep = !isStoreManager; // admin + approvatori

  const [modalita, setModalita] = useState<ModalitaCreazione>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SchedaForm>(() => ({
    ...emptyForm,
    data_richiesta_affidamento: new Date().toISOString().slice(0, 10),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const padRef = useRef<HTMLDivElement>(null);
  const [hasSig, setHasSig] = useState(false);

  // Stato per modalità Aggiornamento: cliente selezionato e contatti esistenti
  const [clienteEsistenteId, setClienteEsistenteId] = useState<string | null>(null);
  const [titolareEsistenteId, setTitolareEsistenteId] = useState<string | null>(null);
  const [amministrativoEsistenteId, setAmministrativoEsistenteId] = useState<string | null>(null);

  // Carica un cliente esistente e precompila il form (modalità Aggiornamento)
  async function caricaClienteEsistente(clienteId: string) {
    const { data: cliente, error } = await supabase
      .from("clienti").select("*").eq("id", clienteId).maybeSingle();
    if (error || !cliente) {
      toast.error("Impossibile caricare il cliente selezionato");
      return;
    }
    const { data: contatti } = await supabase
      .from("contatti").select("*").eq("cliente_id", clienteId).order("principale", { ascending: false });
    const titolare = (contatti ?? []).find((c: any) => c.principale) ?? null;
    const amm = (contatti ?? []).find((c: any) => !c.principale) ?? null;

    setClienteEsistenteId(clienteId);
    setTitolareEsistenteId(titolare?.id ?? null);
    setAmministrativoEsistenteId(amm?.id ?? null);

    const c = cliente as any;
    setForm((f) => ({
      ...f,
      tipo: "aggiornamento",
      tipo_soggetto: (c.tipo_soggetto === "persona_fisica" ? "persona_fisica" : "azienda") as SchedaForm["tipo_soggetto"],
      ragione_sociale: c.ragione_sociale ?? "",
      codice_gestionale: c.codice_gestionale ?? "",
      indirizzo: c.indirizzo ?? "",
      cap: c.cap ?? "",
      citta: c.citta ?? "",
      provincia: c.provincia ?? "",
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      partita_iva: c.partita_iva ?? "",
      codice_fiscale: c.codice_fiscale ?? "",
      banca: c.banca ?? "",
      agenzia: c.agenzia ?? "",
      abi: c.abi ?? "",
      cab: c.cab ?? "",
      codice_sdi: c.codice_sdi ?? "",
      pec: c.pec ?? "",
      store_id: c.store_id ?? "",
      titolare_nome: titolare?.nome ?? "",
      titolare_cognome: titolare?.cognome ?? "",
      titolare_email: titolare?.email ?? "",
      titolare_cell: titolare?.cellulare ?? titolare?.telefono ?? "",
      amministrativo_nome: amm?.nome ?? "",
      amministrativo_cognome: amm?.cognome ?? "",
      amministrativo_email: amm?.email ?? "",
      amministrativo_cell: amm?.cellulare ?? amm?.telefono ?? "",
      codice_assegnato: c.codice_assegnato ?? "",
      sede_operatore: c.sede_operatore ?? "",
      condizioni_pagamento_concordate: c.condizioni_pagamento_concordate ?? "",
      data_richiesta_affidamento: c.data_richiesta_affidamento ?? "",
      importo_affidamento_richiesto: c.importo_affidamento_richiesto != null ? String(c.importo_affidamento_richiesto) : "",
      note_amministrazione: c.note_amministrazione ?? "",
      dichiarante_nome: c.dichiarante_nome ?? "",
      dichiarante_cognome: c.dichiarante_cognome ?? "",
    }));
    toast.success(`Cliente "${c.ragione_sociale}" caricato`);
  }

  function resetClienteEsistente() {
    setClienteEsistenteId(null);
    setTitolareEsistenteId(null);
    setAmministrativoEsistenteId(null);
  }

  // Steps dinamici in base a modalità e ruolo
  const steps = useMemo(() => {
    const s = ["Impresa", "Contatti"];
    if (canSeeAdminStep) s.push("Amministrazione");
    if (modalita === "con_firma") s.push("Firma");
    return s;
  }, [modalita, canSeeAdminStep]);

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
    const label = steps[s];
    const errs: Record<string, string> = {};
    if (label === "Impresa") {
      if (form.tipo === "aggiornamento" && !clienteEsistenteId) {
        errs.ragione_sociale = "Seleziona il cliente da aggiornare dal campo di ricerca sopra";
        toast.error("Seleziona prima un cliente esistente dal campo di ricerca");
      } else if (!form.ragione_sociale.trim()) {
        errs.ragione_sociale = "Obbligatorio";
      }
      if (form.email && !z.string().email().safeParse(form.email).success) errs.email = "Email non valida";
    }
    if (label === "Contatti") {
      if (!(form.titolare_nome ?? "").trim()) errs.titolare_nome = "Nome Titolare obbligatorio";
      if (!(form.titolare_cognome ?? "").trim()) errs.titolare_cognome = "Cognome Titolare obbligatorio";
    }
    if (label === "Firma") {
      if (!(form.dichiarante_nome ?? "").trim()) errs.dichiarante_nome = "Obbligatorio";
      if (!(form.dichiarante_cognome ?? "").trim()) errs.dichiarante_cognome = "Obbligatorio";
      if (!hasSig) errs.firma = "Firma obbligatoria";
      if (form.consenso_profilazione !== "si" && form.consenso_profilazione !== "no") errs.consenso_profilazione = "Scegli un'opzione";
      if (form.consenso_marketing_media !== "si" && form.consenso_marketing_media !== "no") errs.consenso_marketing_media = "Scegli un'opzione";
      if (form.consenso_marketing_diretto !== "si" && form.consenso_marketing_diretto !== "no") errs.consenso_marketing_diretto = "Scegli un'opzione";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    // Quando si passa allo step Firma, precompila il dichiarante dal Titolare
    const next = steps[step + 1];
    if (next === "Firma") {
      setForm((f) => ({
        ...f,
        dichiarante_nome: f.dichiarante_nome || f.titolare_nome || "",
        dichiarante_cognome: f.dichiarante_cognome || f.titolare_cognome || "",
      }));
    }
    setStep((s) => s + 1);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schedaSchema.parse(form);
      const conFirma = modalita === "con_firma";

      let dataUrl: string | null = null;
      if (conFirma) {
        dataUrl = padRef.current ? getCanvasDataURL(padRef.current) : null;
        if (!dataUrl) throw new Error("Inserisci la firma");
      }

      const now = new Date();
      const { data: { user } } = await supabase.auth.getUser();

      const isAggiornamento = parsed.tipo === "aggiornamento" && !!clienteEsistenteId;
      let clienteId: string | null = isAggiornamento ? clienteEsistenteId : null;
      const uploadedPaths: Array<{ bucket: string; path: string }> = [];

      const rollback = async (reason: string) => {
        try {
          for (const u of uploadedPaths) {
            await supabase.storage.from(u.bucket).remove([u.path]);
          }
          // In aggiornamento NON eliminiamo il cliente esistente
          if (!isAggiornamento && clienteId) {
            await supabase.from("contatti").delete().eq("cliente_id", clienteId);
            await supabase.from("clienti").delete().eq("id", clienteId);
          }
        } catch { /* best-effort */ }
        throw new Error(reason);
      };

      try {
        // 1. INSERT/UPDATE cliente (dati Step 1 + Step 3 se admin)
        const num = (s?: string) => {
          if (!s) return null;
          const n = Number(String(s).replace(",", "."));
          return Number.isFinite(n) ? n : null;
        };
        const date = (s?: string) => (s && s.trim() ? s : null);

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
          dichiarante_nome: parsed.dichiarante_nome || null,
          dichiarante_cognome: parsed.dichiarante_cognome || null,
        };
        if (!isAggiornamento) {
          clientePayload.created_by = user?.id;
        }
        if (canSeeAdminStep) {
          Object.assign(clientePayload, {
            codice_assegnato: parsed.codice_assegnato || null,
            condizioni_pagamento_concordate: parsed.condizioni_pagamento_concordate || null,
            data_richiesta_affidamento: date(parsed.data_richiesta_affidamento),
            importo_affidamento_richiesto: num(parsed.importo_affidamento_richiesto),
            note_amministrazione: parsed.note_amministrazione || null,
          });
        }

        if (isAggiornamento) {
          const { error: eUpd } = await supabase
            .from("clienti").update(clientePayload as never).eq("id", clienteId!);
          if (eUpd) throw new Error(`Aggiornamento cliente: ${eUpd.message}`);
        } else {
          const { data: cliente, error: e1 } = await supabase
            .from("clienti").insert(clientePayload as never).select("id").single();
          if (e1) throw new Error(`Inserimento cliente: ${e1.message}`);
          if (!cliente || !(cliente as { id?: string }).id) {
            throw new Error("Inserimento cliente: id non restituito");
          }
          clienteId = (cliente as { id: string }).id;
        }

        // 2. INSERT/UPDATE contatti (Titolare sempre, Amm.vo se compilato).
        const titolarePayload: Record<string, unknown> = {
          cliente_id: clienteId,
          nome: parsed.titolare_nome,
          cognome: parsed.titolare_cognome || null,
          ruolo: "Titolare / Legale Rappresentante",
          email: parsed.titolare_email || null,
          cellulare: parsed.titolare_cell || null,
          principale: true,
        };
        const ammPayload: Record<string, unknown> | null = (parsed.amministrativo_nome ?? "").trim()
          ? {
              cliente_id: clienteId,
              nome: parsed.amministrativo_nome,
              cognome: parsed.amministrativo_cognome || null,
              ruolo: "Referente Amministrativo",
              email: parsed.amministrativo_email || null,
              cellulare: parsed.amministrativo_cell || null,
              principale: false,
            }
          : null;

        let contattiCreati: Array<{ id: string; principale: boolean }> = [];
        if (isAggiornamento) {
          if (titolareEsistenteId) {
            const { error } = await supabase.from("contatti")
              .update(titolarePayload as never).eq("id", titolareEsistenteId);
            if (error) throw new Error(`Aggiornamento titolare: ${error.message}`);
            contattiCreati.push({ id: titolareEsistenteId, principale: true });
          } else {
            const { data, error } = await supabase.from("contatti")
              .insert(titolarePayload as never).select("id, principale").single();
            if (error) throw new Error(`Inserimento titolare: ${error.message}`);
            if (data) contattiCreati.push(data as { id: string; principale: boolean });
          }
          if (ammPayload) {
            if (amministrativoEsistenteId) {
              const { error } = await supabase.from("contatti")
                .update(ammPayload as never).eq("id", amministrativoEsistenteId);
              if (error) throw new Error(`Aggiornamento referente: ${error.message}`);
            } else {
              const { error } = await supabase.from("contatti")
                .insert(ammPayload as never);
              if (error) throw new Error(`Inserimento referente: ${error.message}`);
            }
          }
        } else {
          const contattiToInsert: Array<Record<string, unknown>> = [titolarePayload];
          if (ammPayload) contattiToInsert.push(ammPayload);
          const { data, error: e5 } = await supabase
            .from("contatti")
            .insert(contattiToInsert as never)
            .select("id, principale");
          if (e5) throw new Error(`Salvataggio contatti: ${e5.message}`);
          contattiCreati = (data ?? []) as Array<{ id: string; principale: boolean }>;
        }

        // 2.bis Se è stato indicato un Importo Affidamento Richiesto, crea
        //       una richiesta_fido in bozza che segue il normale iter di approvazione.
        console.log("[richiesta-fido] check creazione:", {
          canSeeAdminStep,
          importo_raw: parsed.importo_affidamento_richiesto,
          importo_parsed: num(parsed.importo_affidamento_richiesto),
          clienteId,
          store_id: parsed.store_id,
          user_id: user?.id,
        });
        if (canSeeAdminStep) {
          const importoRichiesto = num(parsed.importo_affidamento_richiesto);
          if (importoRichiesto != null && importoRichiesto > 0) {
            try {
              const importoNum = Number(importoRichiesto);
              const livelloCalc = importoNum <= 5000 ? 1 : importoNum <= 20000 ? 2 : 3;
              const payload = {
                cliente_id: clienteId,
                store_id: parsed.store_id || null,
                tipo: "nuovo_fido",
                stato: "bozza",
                importo_richiesto: importoRichiesto,
                livello_richiesto: livelloCalc,
                livello_corrente: livelloCalc,
                motivazione: parsed.note_amministrazione || null,
                created_by: user?.id ?? null,
              };
              console.log("[richiesta-fido] insert payload:", payload);
              const { data: rfData, error: eRf } = await supabase
                .from("richieste_fido")
                .insert(payload as never)
                .select()
                .single();
              console.log("[richiesta-fido] insert result:", { rfData, eRf });
              if (eRf) {
                toast.warning(`Cliente creato, ma richiesta fido non generata: ${eRf.message}`);
              } else {
                toast.success("Richiesta fido in bozza creata");
              }
            } catch (rfErr) {
              console.error("[richiesta-fido] eccezione:", rfErr);
              const m = rfErr instanceof Error ? rfErr.message : "Errore richiesta fido";
              toast.warning(`Cliente creato, ma richiesta fido non generata: ${m}`);
            }
          } else {
            console.warn("[richiesta-fido] saltata: importo non valido o <= 0", {
              importo_raw: parsed.importo_affidamento_richiesto,
            });
            toast.info("Richiesta fido non creata: importo affidamento mancante o = 0");
          }
        } else {
          console.warn("[richiesta-fido] saltata: canSeeAdminStep = false (utente non admin/approvatore)");
        }


        // 3. Solo ORA, se richiesto, generiamo firma + PDF. Eventuali errori
        //    qui NON devono distruggere il cliente/contatti già salvati.
        if (conFirma && dataUrl) {
          try {
            // Upload firma PNG
            const pngBlob = await (await fetch(dataUrl)).blob();
            const firmaPath = `clienti/${clienteId}/firma-${now.getTime()}.png`;
            const { error: e2 } = await supabase.storage.from("firme")
              .upload(firmaPath, pngBlob, { upsert: true, contentType: "image/png" });
            if (e2) throw new Error(`Upload firma: ${e2.message}`);
            const firmaUrl = supabase.storage.from("firme").getPublicUrl(firmaPath).data.publicUrl;

            // Genera PDF scheda cliente
            const storeNome =
              (stores ?? []).find((s) => s.id === parsed.store_id)?.nome ?? null;

            const schedaPayload = {
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
              puntoVendita: storeNome,
              titolareNome: parsed.titolare_nome,
              titolareCognome: parsed.titolare_cognome,
              titolareEmail: parsed.titolare_email,
              titolareCell: parsed.titolare_cell,
              amministrativoNome: parsed.amministrativo_nome,
              amministrativoCognome: parsed.amministrativo_cognome,
              amministrativoEmail: parsed.amministrativo_email,
              amministrativoCell: parsed.amministrativo_cell,
              dichiaranteNome: parsed.dichiarante_nome,
              dichiaranteCognome: parsed.dichiarante_cognome,
              dichiaranteSocieta: parsed.dichiarante_societa || parsed.ragione_sociale,
              dichiaranteLuogoNascita: parsed.dichiarante_luogo_nascita,
              dichiaranteDataNascita: parsed.dichiarante_data_nascita,
              dichiaranteCodiceFiscale: parsed.dichiarante_codice_fiscale,
              dichiaranteResidenza: parsed.dichiarante_residenza,
              dichiaranteEmail: parsed.dichiarante_email,
              dichiaranteCell: parsed.dichiarante_cell,
              consensoProfilazione: parsed.consenso_profilazione,
              consensoMarketingMedia: parsed.consenso_marketing_media,
              consensoMarketingDiretto: parsed.consenso_marketing_diretto,
              whatsappOptIn: parsed.whatsapp_opt_in === true,
              firmaPngDataUrl: dataUrl,
              dataFirma: now,
            };

            // [DEBUG] Parametri passati a generaSchedaCliente
            console.log("[scheda-pdf] input payload:", schedaPayload);

            const pdfBytes = await generaSchedaCliente(schedaPayload);

            // [DEBUG] Dimensione PDF generato
            console.log(
              `[scheda-pdf] pdfBytes size: ${pdfBytes?.byteLength ?? 0} bytes`,
              (pdfBytes?.byteLength ?? 0) < 5000
                ? "⚠️ PDF sospettosamente piccolo (<5000 bytes)"
                : "✓ dimensione OK"
            );

            const pdfSchedaPath = `clienti/${clienteId}/scheda-${now.getTime()}.pdf`;
            const { error: e3 } = await supabase.storage.from("documenti-privacy")
              .upload(pdfSchedaPath, pdfBytes, { contentType: "application/pdf", upsert: true });
            if (e3) throw new Error(`Upload scheda PDF: ${e3.message}`);
            const pdfSchedaUrl = supabase.storage.from("documenti-privacy").getPublicUrl(pdfSchedaPath).data.publicUrl;

            // Aggiorna cliente con riepilogo firma
            await supabase.from("clienti").update({
              privacy_firmata: true,
              data_firma: now.toISOString(),
              firma_url: firmaUrl,
              scheda_pdf_url: pdfSchedaUrl,
            } as never).eq("id", clienteId!);

            // Aggiorna il contatto titolare con i riferimenti firma/PDF + dati dichiarante + consensi
            const titolare = (contattiCreati ?? []).find((c: any) => c.principale);
            if (titolare) {
              await supabase.from("contatti").update({
                privacy_firmata: true,
                data_firma: now.toISOString(),
                firma_url: firmaUrl,
                pdf_privacy_url: pdfSchedaUrl,
                pdf_privacy_path: pdfSchedaPath,
                luogo_nascita: parsed.dichiarante_luogo_nascita || null,
                data_nascita: parsed.dichiarante_data_nascita || null,
                codice_fiscale: parsed.dichiarante_codice_fiscale || null,
                residenza: parsed.dichiarante_residenza || null,
                email: parsed.dichiarante_email || parsed.titolare_email || null,
                cellulare: parsed.dichiarante_cell || parsed.titolare_cell || null,
                whatsapp_opt_in: parsed.whatsapp_opt_in === true,
                consenso_profilazione: parsed.consenso_profilazione === "si",
                consenso_marketing_media: parsed.consenso_marketing_media === "si",
                consenso_marketing_diretto: parsed.consenso_marketing_diretto === "si",
              } as never).eq("id", (titolare as { id: string }).id);
            }
          } catch (pdfErr) {
            // [DEBUG] Errore completo con stack trace
            console.error("[scheda-pdf] errore generazione/upload PDF:", pdfErr);
            if (pdfErr instanceof Error) {
              console.error("[scheda-pdf] stack:", pdfErr.stack);
            }

            // NON eseguire rollback: cliente e contatti restano salvati.
            const m = pdfErr instanceof Error ? pdfErr.message : "Errore generazione PDF";
            toast.warning(`Cliente salvato senza PDF firmato: ${m}`);
          }
        }


        return clienteId;
      } catch (err) {

        const msg = err instanceof Error ? err.message : "Errore durante il salvataggio";
        await rollback(msg);
        return null;
      }
    },
    onSuccess: () => {
      toast.success(
        modalita === "con_firma"
          ? "Scheda cliente creata e firmata"
          : "Scheda cliente creata"
      );
      qc.invalidateQueries({ queryKey: ["clienti"] });
      onClose();
    },
    onError: (err: any) => {
      const code = err?.code ?? "";
      const msg = err?.message ?? "";
      if (code === "23505" || msg.includes("clienti_codice_gestionale_unique")) {
        toast.error("Codice gestionale già utilizzato. Inseriscine uno diverso o lascialo vuoto.");
        setStep(0);
        return;
      }
      toast.error(msg || "Errore durante il salvataggio");
    },
  });

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step, steps.length]);
  const currentStepLabel = steps[step];

  // --- Selezione modalità iniziale ---
  if (modalita === null) {
    return (
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova scheda cliente</DialogTitle>
          <DialogDescription>Scegli come vuoi creare la scheda.</DialogDescription>
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
              Inserimento rapido dell'anagrafica e dei contatti, senza firma né PDF (potrai raccoglierla dopo).
            </p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const isLastStep = step >= steps.length - 1;

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          Scheda inserimento cliente
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {modalita === "con_firma" ? "(con firma)" : "(senza firma)"}
          </span>
        </DialogTitle>
        <DialogDescription>
          Step {step + 1} di {steps.length} — {currentStepLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="space-y-4 mt-2">
        {currentStepLabel === "Impresa" && (
          <StepImpresa
            form={form}
            set={set}
            errors={errors}
            stores={stores ?? []}
            clienteEsistenteId={clienteEsistenteId}
            onSelectClienteEsistente={caricaClienteEsistente}
            onResetClienteEsistente={resetClienteEsistente}
          />
        )}
        {currentStepLabel === "Contatti" && (
          <StepContatti form={form} set={set} errors={errors} />
        )}
        {currentStepLabel === "Amministrazione" && (
          <StepAmministrazione form={form} set={set} />
        )}
        {currentStepLabel === "Firma" && (
          <StepFirma form={form} set={set} errors={errors} padRef={padRef} setHasSig={setHasSig} />
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="size-4 mr-1" /> Indietro
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setModalita(null)}>
            <ArrowLeft className="size-4 mr-1" /> Cambia modalità
          </Button>
        )}
        {!isLastStep ? (
          <Button type="button" onClick={goNext}>
            Avanti <ArrowRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={submit.isPending}
            onClick={() => { if (validateStep(step)) submit.mutate(); }}
          >
            {submit.isPending ? "Salvataggio..." : (
              <><Check className="size-4 mr-1" />
                {modalita === "con_firma" ? "Crea scheda e firma" : "Crea scheda"}
              </>
            )}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

type SetFn = <K extends keyof SchedaForm>(k: K, v: SchedaForm[K]) => void;

function ClientePicker({
  clienteEsistenteId,
  ragioneSocialeAttuale,
  onSelect,
  onReset,
}: {
  clienteEsistenteId: string | null;
  ragioneSocialeAttuale: string;
  onSelect: (clienteId: string) => void | Promise<void>;
  onReset: () => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const termTrim = term.trim();
  const { data: results, isFetching } = useQuery({
    queryKey: ["clienti-picker", termTrim],
    queryFn: async () => {
      if (termTrim.length < 2) return [];
      const like = `%${termTrim.replace(/[(),]/g, " ")}%`;
      const { data, error } = await supabase
        .from("clienti")
        .select("id, ragione_sociale, codice_gestionale, partita_iva, citta")
        .or(`ragione_sociale.ilike.${like},codice_gestionale.ilike.${like}`)
        .order("ragione_sociale")
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: termTrim.length >= 2 && !clienteEsistenteId,
  });

  if (clienteEsistenteId) {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-foreground">Aggiornamento di: {ragioneSocialeAttuale}</p>
          <p className="text-xs text-muted-foreground">Modifica i campi sotto e salva per aggiornare il cliente.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <X className="size-4 mr-1" /> Cambia cliente
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <Label className="text-sm">Cerca cliente da aggiornare *</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Digita ragione sociale o codice gestionale..."
          className="pl-9"
        />
      </div>
      {open && termTrim.length >= 2 && (
        <div className="rounded-md border bg-popover max-h-64 overflow-y-auto">
          {isFetching ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ricerca in corso…</p>
          ) : (results ?? []).length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Nessun cliente trovato</p>
          ) : (
            (results ?? []).map((c: any) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                onClick={() => { onSelect(c.id); setOpen(false); setTerm(""); }}
              >
                <div className="font-medium">{c.ragione_sociale}</div>
                <div className="text-xs text-muted-foreground">
                  {c.codice_gestionale ? `Cod. ${c.codice_gestionale}` : "—"}
                  {c.partita_iva ? ` · P.IVA ${c.partita_iva}` : ""}
                  {c.citta ? ` · ${c.citta}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      {termTrim.length > 0 && termTrim.length < 2 && (
        <p className="text-xs text-muted-foreground">Digita almeno 2 caratteri…</p>
      )}
    </div>
  );
}

function StepImpresa({
  form, set, errors, stores, clienteEsistenteId, onSelectClienteEsistente, onResetClienteEsistente,
}: {
  form: SchedaForm;
  set: SetFn;
  errors: Record<string, string>;
  stores: Array<{ id: string; nome: string; codice: string }>;
  clienteEsistenteId: string | null;
  onSelectClienteEsistente: (clienteId: string) => void | Promise<void>;
  onResetClienteEsistente: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo modulo</Label>
          <RadioGroup
            value={form.tipo}
            onValueChange={(v) => {
              set("tipo", v as SchedaForm["tipo"]);
              if (v !== "aggiornamento") onResetClienteEsistente();
            }}
            className="flex gap-4"
          >
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

      {form.tipo === "aggiornamento" && (
        <ClientePicker
          clienteEsistenteId={clienteEsistenteId}
          ragioneSocialeAttuale={form.ragione_sociale}
          onSelect={onSelectClienteEsistente}
          onReset={onResetClienteEsistente}
        />
      )}



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

      <h3 className="font-semibold text-sm pt-2">Dati bancari</h3>
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

function StepContatti({
  form, set, errors,
}: { form: SchedaForm; set: SetFn; errors: Record<string, string> }) {
  return (
    <>
      <h3 className="font-semibold text-sm">Titolare / Legale Rappresentante *</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.titolare_nome} onChange={(e) => set("titolare_nome", e.target.value)} />
          {errors.titolare_nome && <p className="text-xs text-destructive">{errors.titolare_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome *</Label>
          <Input value={form.titolare_cognome} onChange={(e) => set("titolare_cognome", e.target.value)} />
          {errors.titolare_cognome && <p className="text-xs text-destructive">{errors.titolare_cognome}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.titolare_email} onChange={(e) => set("titolare_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.titolare_cell} onChange={(e) => set("titolare_cell", e.target.value)} />
        </div>
      </div>

      <h3 className="font-semibold text-sm pt-3">
        Referente Amministrativo{" "}
        <span className="text-muted-foreground font-normal">(opzionale, se diverso dal Titolare)</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input value={form.amministrativo_nome} onChange={(e) => set("amministrativo_nome", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cognome</Label>
          <Input value={form.amministrativo_cognome} onChange={(e) => set("amministrativo_cognome", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.amministrativo_email} onChange={(e) => set("amministrativo_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.amministrativo_cell} onChange={(e) => set("amministrativo_cell", e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        I contatti saranno collegati automaticamente al cliente nella sezione "Contatti".
      </p>
    </>
  );
}

function StepAmministrazione({ form, set }: { form: SchedaForm; set: SetFn }) {
  return (
    <>
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Spazio riservato Amministrazione</p>
        <p className="text-muted-foreground">
          Sezione visibile solo ad amministratori e approvatori. Tutti i campi sono opzionali.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice assegnato</Label>
          <Input value={form.codice_assegnato} onChange={(e) => set("codice_assegnato", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Condizioni di pagamento concordate</Label>
        <Input value={form.condizioni_pagamento_concordate} onChange={(e) => set("condizioni_pagamento_concordate", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Data Richiesta Affidamento</Label>
          <Input type="date" value={form.data_richiesta_affidamento} onChange={(e) => set("data_richiesta_affidamento", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Importo Affidamento Richiesto (€)</Label>
          <Input type="number" step="0.01" value={form.importo_affidamento_richiesto} onChange={(e) => set("importo_affidamento_richiesto", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Note</Label>
        <Textarea rows={3} value={form.note_amministrazione} onChange={(e) => set("note_amministrazione", e.target.value)} />
      </div>
    </>
  );
}


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

function StepFirma({
  form, set, errors, padRef, setHasSig,
}: {
  form: SchedaForm; set: SetFn; errors: Record<string, string>;
  padRef: React.RefObject<HTMLDivElement | null>; setHasSig: (b: boolean) => void;
}) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [dataFirma, setDataFirma] = useState(todayISO);

  const ConsensoBlock = ({
    k, testo,
  }: { k: "consenso_profilazione" | "consenso_marketing_media" | "consenso_marketing_diretto"; testo: string }) => (
    <div className="rounded-md border p-3 space-y-2">
      <p className="leading-relaxed" style={{ fontSize: "11px" }}>{testo}</p>
      <RadioGroup value={form[k]} onValueChange={(v) => set(k, v as "si" | "no")} className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="si" /> fornisce il consenso
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="no" /> nega il consenso
        </label>
      </RadioGroup>
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <>
      {/* SEZIONE 1 — Dati dichiarante */}
      <div className="rounded-md border bg-muted/40 p-3 text-xs">
        <p className="font-medium text-foreground mb-1">Dati del Dichiarante (Titolare / Legale Rappresentante)</p>
        <p className="text-muted-foreground">Nome e cognome precompilati dallo step Contatti.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={form.dichiarante_nome} onChange={(e) => set("dichiarante_nome", e.target.value)} />
          {errors.dichiarante_nome && <p className="text-xs text-destructive">{errors.dichiarante_nome}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cognome *</Label>
          <Input value={form.dichiarante_cognome} onChange={(e) => set("dichiarante_cognome", e.target.value)} />
          {errors.dichiarante_cognome && <p className="text-xs text-destructive">{errors.dichiarante_cognome}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Società / Ente rappresentato</Label>
        <Input value={form.dichiarante_societa} onChange={(e) => set("dichiarante_societa", e.target.value)} placeholder={form.ragione_sociale} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Luogo di nascita</Label>
          <Input value={form.dichiarante_luogo_nascita} onChange={(e) => set("dichiarante_luogo_nascita", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Data di nascita</Label>
          <Input type="date" value={form.dichiarante_data_nascita} onChange={(e) => set("dichiarante_data_nascita", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Codice fiscale</Label>
          <Input value={form.dichiarante_codice_fiscale} onChange={(e) => set("dichiarante_codice_fiscale", e.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1.5">
          <Label>Residenza</Label>
          <Input value={form.dichiarante_residenza} onChange={(e) => set("dichiarante_residenza", e.target.value)} placeholder="Via, n°, CAP, Città (Prov.)" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={form.dichiarante_email} onChange={(e) => set("dichiarante_email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cellulare</Label>
          <Input value={form.dichiarante_cell} onChange={(e) => set("dichiarante_cell", e.target.value)} />
        </div>
      </div>

      {/* SEZIONE 2 — Informativa completa scrollabile */}
      <div
        className="rounded-md border bg-muted/40 p-3 overflow-y-auto whitespace-pre-line leading-relaxed"
        style={{ height: "250px", fontSize: "11px" }}
      >
        {INFORMATIVA_FULL}
      </div>

      {/* SEZIONE 3 — Testo introduttivo grassetto */}
      <p className="font-bold leading-relaxed" style={{ fontSize: "12px" }}>
        Il sottoscritto, avendo letto l'informativa fornita dal titolare del trattamento ai sensi dell'art. 13 GDPR sul trattamento e sulla comunicazione dei dati personali (comuni, sensibili) da questo effettuati, con le finalita' connesse all'adempimento del rapporto contrattuale e ai connessi adempimenti di legge, essendo consapevole che in mancanza di consenso ai predetti trattamenti il titolare non potra' - da un lato - assolvere gli obblighi di legge e quindi costituire o proseguire il rapporto contrattuale e - dall'altro - di svolgere la propria attivita' tipica,
      </p>

      {/* SEZIONE 4 — Tre blocchi consenso */}
      <div className="space-y-3">
        <ConsensoBlock k="consenso_profilazione" testo={CONSENSO_TESTI.profilazione} />
        <ConsensoBlock k="consenso_marketing_media" testo={CONSENSO_TESTI.media} />
        <ConsensoBlock k="consenso_marketing_diretto" testo={CONSENSO_TESTI.diretto} />
      </div>

      {/* SEZIONE 5 — Data + firma */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Data</Label>
          <Input type="date" value={dataFirma} onChange={(e) => setDataFirma(e.target.value)} />
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
