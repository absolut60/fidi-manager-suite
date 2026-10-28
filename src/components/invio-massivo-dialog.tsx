import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, Users, ListChecks, AlertTriangle, Eye, ChevronLeft, ChevronRight, Pencil, AlertCircle, CheckCircle2, Trash2, RotateCcw, Gavel } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/hooks/use-config";
import { classificaScadenza } from "@/lib/scadenze";
import { renderTemplate, wrapEmailHtml, caricaSedeCliente, type TemplateEmail, type DatiTemplate } from "@/lib/template-email";
import {
  classificaDestinatarioProgressivo,
  scegliTemplateProgressivi,
  type LivelloSollecito,
  type StadioSollecito,
} from "@/lib/escalation-solleciti";
import { STADIO_LABEL, StadioSollecitoBadge } from "@/components/stadio-sollecito-badge";
import { formatEuro } from "@/lib/fidi";
import { useAuth } from "@/hooks/use-auth";
import { puoInviareComunicazioniRecupero } from "@/lib/recupero-permessi";
import { avviaCampagnaSollecito } from "@/lib/sollecito-massivo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteIdsSelezionati: string[];
  clienteIdsFiltrati: string[];
  tipoCampagna?: "sollecito" | "promemoria_scadenza";
  // YYYY-MM[]; richiesto per i promemoria di scadenza (filtro scadenze future)
  mesi?: string[];
};

type ClientePreviewData = {
  id: string;
  ragione_sociale: string;
  email: string | null;
  pec: string | null;
  dati: DatiTemplate;
};

type StadioConNome = StadioSollecito & { ragione_sociale: string };
type VoceCliente = { id: string; nome: string; scaduto: number; dettaglio: string };
type Classificazione = {
  inviabili: string[];
  livelli: Record<LivelloSollecito, { n: number; importo: number }>;
  moraRipetuta: VoceCliente[];
  attesa: VoceCliente[];
  noScaduto: VoceCliente[];
  legale: VoceCliente[];
};

function dataIt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

function sommaScaduto(l: VoceCliente[]) {
  return l.reduce((a, v) => a + v.scaduto, 0);
}

function RigaGruppo({ label, n, importo, voci, tono }: {
  label: React.ReactNode;
  n: number;
  importo: number;
  voci?: VoceCliente[];
  tono?: "danger";
}) {
  const testa = (
    <span className={`flex items-start gap-2 ${tono === "danger" ? "text-destructive" : ""}`}>
      <span className="min-w-0 flex-1 break-words">{label}</span>
      <span className="shrink-0 tabular-nums font-medium">{n}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground w-24 text-right">{formatEuro(importo)}</span>
    </span>
  );
  if (!voci || voci.length === 0) return <div className="py-0.5">{testa}</div>;
  return (
    <details className="py-0.5 group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-start gap-1">
          <ChevronRight className="size-3.5 mt-0.5 shrink-0 transition-transform group-open:rotate-90" />
          <span className="min-w-0 flex-1">{testa}</span>
        </span>
      </summary>
      <ul className="mt-1 ml-5 max-h-40 overflow-y-auto space-y-0.5 border-l border-border pl-2">
        {voci.map((v) => (
          <li key={v.id} className="text-[11px]">
            <span className="font-medium text-foreground break-words">{v.nome}</span>
            <span className="text-muted-foreground"> — {v.dettaglio}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RiepilogoLivelli({ c, giorniMinimi }: { c: Classificazione; giorniMinimi: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs space-y-0.5">
      <div className="font-medium mb-1">Riepilogo per livello</div>
      <RigaGruppo label="Riceveranno il 1° sollecito" n={c.livelli[1].n} importo={c.livelli[1].importo} />
      <RigaGruppo label="Riceveranno il 2° sollecito" n={c.livelli[2].n} importo={c.livelli[2].importo} />
      <RigaGruppo label="Riceveranno la messa in mora" n={c.livelli[3].n} importo={c.livelli[3].importo} />
      <RigaGruppo
        tono="danger"
        label={<span className="inline-flex items-start gap-1"><Gavel className="size-3.5 mt-0.5 shrink-0" />di cui messa in mora ripetuta → proposta di passaggio al legale</span>}
        n={c.moraRipetuta.length}
        importo={sommaScaduto(c.moraRipetuta)}
        voci={c.moraRipetuta}
      />
      <div className="pt-1 mt-1 border-t border-border text-muted-foreground font-medium">Saltati</div>
      <RigaGruppo label={`Attesa ${giorniMinimi} gg`} n={c.attesa.length} importo={sommaScaduto(c.attesa)} voci={c.attesa} />
      <RigaGruppo label="Senza scaduto" n={c.noScaduto.length} importo={sommaScaduto(c.noScaduto)} voci={c.noScaduto} />
      <RigaGruppo label="In gestione legale" n={c.legale.length} importo={sommaScaduto(c.legale)} voci={c.legale} />
    </div>
  );
}

export function InvioMassivoDialog({
  open,
  onOpenChange,
  clienteIdsSelezionati,
  clienteIdsFiltrati,
  tipoCampagna = "sollecito",
  mesi = [],
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cfg = useConfig();
  const { user, profilo, roles } = useAuth();
  const puoInviare = puoInviareComunicazioniRecupero(roles as string[]);
  const nomeOperatore = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Operatore";
  const avvia = useServerFn(avviaCampagnaSollecito);

  const [modo, setModo] = useState<"selezionati" | "filtrati">("selezionati");
  const [templateId, setTemplateId] = useState<string>("");
  const [preferenza, setPreferenza] = useState<"email" | "pec">("email");
  const [nota, setNota] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [indice, setIndice] = useState(0);
  const [jumpInput, setJumpInput] = useState("");
  // Override manuali: cliente_id -> indirizzo corretto (stringa, può essere "")
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Indirizzi risolti scoperti durante la navigazione: cliente_id -> indirizzo default
  const [risolti, setRisolti] = useState<Record<string, string>>({});
  // Esclusioni manuali (rimossi dalla coda di invio di QUESTA campagna)
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  // Cache nomi per mostrare l'elenco esclusi
  const [nomiCache, setNomiCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setNota("");
      setIndice(0);
      setJumpInput("");
      setOverrides({});
      setRisolti({});
      setEsclusi(new Set());
      setNomiCache({});
    } else {
      setModo(clienteIdsSelezionati.length > 0 ? "selezionati" : "filtrati");
    }
  }, [open, clienteIdsSelezionati.length]);

  const clienteIdsBase = useMemo(
    () => (modo === "selezionati" ? clienteIdsSelezionati : clienteIdsFiltrati),
    [modo, clienteIdsSelezionati, clienteIdsFiltrati],
  );
  // Coda effettiva di invio: esclude i clienti rimossi manualmente.
  const clienteIds = useMemo(
    () => clienteIdsBase.filter((cid) => !esclusi.has(cid)),
    [clienteIdsBase, esclusi],
  );
  const totale = clienteIds.length;

  // Reset indice quando cambia il gruppo o il totale diminuisce sotto l'indice
  useEffect(() => {
    setJumpInput("");
  }, [modo]);

  const { data: templates } = useQuery({
    queryKey: ["template-email-attivi", tipoCampagna],
    queryFn: async () => {
      let q = supabase
        .from("template_email")
        .select("id, nome, oggetto, corpo, tipo, attivo")
        .eq("attivo", true);
      if (tipoCampagna === "promemoria_scadenza") {
        q = q.eq("tipo", "promemoria_scadenza");
      } else {
        q = q.neq("tipo", "promemoria_scadenza");
      }
      const { data, error } = await q.order("nome");
      if (error) throw error;
      return data as TemplateEmail[];
    },
    enabled: open && puoInviare,
  });

  useEffect(() => {
    if (templates && templates.length && !templateId) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // ── Solleciti progressivi (FM51): fonti uniche get_stadio_sollecito_clienti +
  // escalation-solleciti.ts. La modalità promemoria_scadenza resta invariata.
  const isSollecito = tipoCampagna !== "promemoria_scadenza";

  const { modelliLivello, erroreModelli } = useMemo((): {
    modelliLivello: Record<LivelloSollecito, TemplateEmail> | null;
    erroreModelli: string | null;
  } => {
    if (!isSollecito || !templates) return { modelliLivello: null, erroreModelli: null };
    try {
      return { modelliLivello: scegliTemplateProgressivi(templates), erroreModelli: null };
    } catch (e) {
      return { modelliLivello: null, erroreModelli: e instanceof Error ? e.message : String(e) };
    }
  }, [isSollecito, templates]);

  const clienteIdsBaseKey = useMemo(() => clienteIdsBase.join(","), [clienteIdsBase]);

  const { data: stadi, error: erroreStadi } = useQuery<Map<string, StadioConNome>>({
    queryKey: ["sollecito-massivo-stadi", clienteIdsBaseKey],
    enabled: open && puoInviare && isSollecito && clienteIdsBase.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out = new Map<string, StadioConNome>();
      const CHUNK = 200;
      for (let i = 0; i < clienteIdsBase.length; i += CHUNK) {
        const slice = clienteIdsBase.slice(i, i + CHUNK);
        const [rs, rc] = await Promise.all([
          supabase.rpc("get_stadio_sollecito_clienti", { _cliente_ids: slice }),
          supabase.from("clienti").select("id, ragione_sociale").in("id", slice),
        ]);
        if (rs.error) throw rs.error;
        if (rc.error) throw rc.error;
        const nomi = new Map((rc.data ?? []).map((c) => [c.id, c.ragione_sociale ?? "—"]));
        for (const r of (rs.data ?? []) as unknown as StadioSollecito[]) {
          out.set(r.cliente_id, { ...r, ragione_sociale: nomi.get(r.cliente_id) ?? "—" });
        }
      }
      return out;
    },
  });

  const classificazione = useMemo((): Classificazione | null => {
    if (!isSollecito || !stadi) return null;
    const c: Classificazione = {
      inviabili: [],
      livelli: { 1: { n: 0, importo: 0 }, 2: { n: 0, importo: 0 }, 3: { n: 0, importo: 0 } },
      moraRipetuta: [],
      attesa: [],
      noScaduto: [],
      legale: [],
    };
    for (const cid of clienteIds) {
      const s = stadi.get(cid);
      if (!s) {
        // Stesso trattamento del server: registrato come "Senza scaduto".
        c.noScaduto.push({ id: cid, nome: cid.slice(0, 8), scaduto: 0, dettaglio: "Cliente non accessibile o non trovato" });
        continue;
      }
      const esito = classificaDestinatarioProgressivo(s);
      const voce: VoceCliente = { id: cid, nome: s.ragione_sociale, scaduto: Number(s.totale_scaduto ?? 0), dettaglio: "" };
      if (esito.stato === "da_inviare") {
        c.inviabili.push(cid);
        c.livelli[esito.livello].n += 1;
        c.livelli[esito.livello].importo += voce.scaduto;
        if (s.ripetizione_mora) c.moraRipetuta.push({ ...voce, dettaglio: `Ultima messa in mora il ${dataIt(s.stadio_data)}` });
      } else if (esito.stato === "saltato_attesa") c.attesa.push({ ...voce, dettaglio: esito.motivo_salto });
      else if (esito.stato === "saltato_no_scaduto") c.noScaduto.push({ ...voce, dettaglio: esito.motivo_salto });
      else c.legale.push({ ...voce, dettaglio: esito.motivo_salto });
    }
    return c;
  }, [isSollecito, stadi, clienteIds]);

  const giorniMinimi = useMemo(() => {
    if (!stadi) return null;
    for (const s of stadi.values()) return s.giorni_minimi;
    return null;
  }, [stadi]);

  // Coda dell'anteprima: per i solleciti solo chi verrà davvero inviato.
  const codaAnteprima = useMemo(
    () => (isSollecito ? classificazione?.inviabili ?? [] : clienteIds),
    [isSollecito, classificazione, clienteIds],
  );
  const totaleAnteprima = codaAnteprima.length;
  const totaleInvio = totaleAnteprima;
  const saltatiRegistrati = isSollecito ? totale - totaleInvio : 0;

  useEffect(() => {
    setIndice((i) => (i >= totaleAnteprima ? Math.max(0, totaleAnteprima - 1) : i));
  }, [totaleAnteprima]);

  const clienteCorrenteId = codaAnteprima[indice] ?? null;
  const stadioCorrente = isSollecito && clienteCorrenteId ? stadi?.get(clienteCorrenteId) ?? null : null;
  const templateAnteprima: TemplateEmail | null = isSollecito
    ? (modelliLivello && stadioCorrente ? modelliLivello[stadioCorrente.livello_successivo] : null)
    : selectedTemplate;

  // Carica on-demand i dati del cliente corrente (no precaricamento)
  const mesiKey = useMemo(() => [...mesi].sort().join(","), [mesi]);
  const { data: clientePreview, isFetching: loadingPreview } = useQuery<ClientePreviewData | null>({
    queryKey: ["sollecito-massivo-cliente", clienteCorrenteId, tipoCampagna, mesiKey],
    enabled: open && !!clienteCorrenteId && puoInviare,
    staleTime: 60_000,
    queryFn: async () => {
      const id = clienteCorrenteId!;
      const { data: cliente, error: e1 } = await supabase
        .from("clienti")
        .select("ragione_sociale, email, pec")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      const { data: rawScad, error: e2 } = await supabase
        .from("scadenze")
        .select("numero_documento, data_documento, data_scadenza, importo_scadenza, codice_pagamento, stato_contabile, data_pagamento_effettiva, giorni_ritardo, tempi_scadenza, in_legale")
        .eq("cliente_id", id)
        .order("data_scadenza", { ascending: true });
      if (e2) throw e2;
      const oggiStr = new Date().toISOString().slice(0, 10);
      const mesiSet = new Set(mesi);
      const rilevanti = (rawScad ?? []).filter((s) => {
        if (tipoCampagna === "promemoria_scadenza") {
          // A scadere (regola unificata, allineata a scadenze.ts / RPC aggregato / dettaglio):
          // data_scadenza >= oggi AND data_pagamento_effettiva IS NULL.
          // NON filtrare per stato_contabile: le R.B. Chiuse alla presentazione
          // ma non incassate restano "a scadere" finché DPE è NULL.
          if ((s as { in_legale?: boolean | null }).in_legale) return false;
          if (s.data_pagamento_effettiva) return false;
          if (!s.data_scadenza || String(s.data_scadenza) < oggiStr) return false;
          if (mesiSet.size > 0) {
            const k = String(s.data_scadenza).slice(0, 7);
            if (!mesiSet.has(k)) return false;
          }
          return true;
        }
        return classificaScadenza(s) === "scaduto";
      });
      return {
        id,
        ragione_sociale: cliente?.ragione_sociale ?? "",
        email: cliente?.email ?? null,
        pec: cliente?.pec ?? null,
        dati: {
          ragione_sociale: cliente?.ragione_sociale ?? "",
          nome_operatore: "Operatore",
          scadenze: rilevanti.map((s) => ({
            numero_documento: s.numero_documento,
            data_documento: s.data_documento,
            data_scadenza: s.data_scadenza,
            importo_scadenza: s.importo_scadenza,
            codice_pagamento: s.codice_pagamento,
          })),
        },
      };
    },
  });

  // Calcola indirizzo risolto (default) per il cliente corrente e cache-lo
  const indirizzoRisolto = useMemo(() => {
    if (!clientePreview) return "";
    const primary = preferenza === "email" ? clientePreview.email : clientePreview.pec;
    const secondary = preferenza === "email" ? clientePreview.pec : clientePreview.email;
    return (primary?.trim() || secondary?.trim() || "");
  }, [clientePreview, preferenza]);

  useEffect(() => {
    if (clientePreview && clienteCorrenteId) {
      setRisolti((prev) =>
        prev[clienteCorrenteId] === indirizzoRisolto ? prev : { ...prev, [clienteCorrenteId]: indirizzoRisolto },
      );
      setNomiCache((prev) =>
        prev[clienteCorrenteId] ? prev : { ...prev, [clienteCorrenteId]: clientePreview.ragione_sociale || "—" },
      );
    }
  }, [clientePreview, clienteCorrenteId, indirizzoRisolto]);

  // Indirizzo "effettivo" per il cliente corrente (override se presente, altrimenti risolto)
  const indirizzoCorrente = clienteCorrenteId
    ? (overrides[clienteCorrenteId] !== undefined ? overrides[clienteCorrenteId] : indirizzoRisolto)
    : "";

  function setIndirizzoCorrente(v: string) {
    if (!clienteCorrenteId) return;
    setOverrides((prev) => ({ ...prev, [clienteCorrenteId]: v }));
  }
  function resetIndirizzoCorrente() {
    if (!clienteCorrenteId) return;
    setOverrides((prev) => {
      const { [clienteCorrenteId]: _, ...rest } = prev;
      return rest;
    });
  }

  // Sede del cliente corrente per anteprima cornice
  const { data: sedeCorrente } = useQuery({
    queryKey: ["sollecito-massivo-sede", clienteCorrenteId],
    queryFn: () => caricaSedeCliente(clienteCorrenteId!),
    enabled: open && !!clienteCorrenteId && puoInviare,
    staleTime: 60_000,
  });

  const anteprima = useMemo(() => {
    if (!templateAnteprima || !clientePreview) return null;
    const dati: DatiTemplate = {
      ...clientePreview.dati,
      nome_operatore: nomeOperatore,
    };
    const base = renderTemplate(
      { oggetto: templateAnteprima.oggetto, corpo: templateAnteprima.corpo },
      dati,
      { tipo: templateAnteprima.tipo, speseImportoUnitario: cfg.spese_insoluto_riba_eur },
    );
    const corpo = wrapEmailHtml(base.corpo, sedeCorrente ?? null, {
      nome: nomeOperatore,
      email: user?.email ?? null,
    }, { tipo: templateAnteprima.tipo });
    return { oggetto: base.oggetto, corpo };
  }, [templateAnteprima, clientePreview, sedeCorrente, nomeOperatore, user?.email, cfg.spese_insoluto_riba_eur]);

  // Conteggi rapidi: si basano solo su ciò che è stato esplorato/corretto
  const numeroCorretti = useMemo(
    () =>
      Object.entries(overrides).filter(
        ([cid, v]) => (v ?? "").trim() !== (risolti[cid] ?? "").trim(),
      ).length,
    [overrides, risolti],
  );
  const senzaIndirizzoVisti = useMemo(() => {
    let n = 0;
    for (const cid of codaAnteprima) {
      const ov = overrides[cid];
      const eff = ov !== undefined ? ov : risolti[cid];
      if (eff === undefined) continue; // non ancora caricato → non lo contiamo qui
      if (!eff || !eff.trim()) n += 1;
    }
    return n;
  }, [codaAnteprima, overrides, risolti]);
  const conIndirizzoVisti = useMemo(() => {
    let n = 0;
    for (const cid of codaAnteprima) {
      const ov = overrides[cid];
      const eff = ov !== undefined ? ov : risolti[cid];
      if (eff === undefined) continue;
      if (eff && eff.trim()) n += 1;
    }
    return n;
  }, [codaAnteprima, overrides, risolti]);
  const nonEsplorati = Math.max(0, totaleAnteprima - conIndirizzoVisti - senzaIndirizzoVisti);

  // Throttling stima (solo i clienti che verranno davvero inviati)
  const blocco = Math.max(1, cfg.sollecito_massivo_blocco);
  const pausa = Math.max(0, cfg.sollecito_massivo_pausa_sec);
  const numBlocchi = Math.max(1, Math.ceil(totaleInvio / blocco));
  const secondiStimati = (numBlocchi - 1) * pausa + numBlocchi * blocco * 2;
  const minutiStimati = totaleInvio === 0 ? 0 : Math.ceil(secondiStimati / 60);

  const avvioDisabilitato =
    submitting ||
    totaleInvio === 0 ||
    (isSollecito ? !modelliLivello || !classificazione || !!erroreModelli : !templateId);

  function vai(delta: number) {
    if (!totaleAnteprima) return;
    setIndice((i) => Math.min(totaleAnteprima - 1, Math.max(0, i + delta)));
  }
  function handleJump() {
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n) || !totaleAnteprima) return;
    setIndice(Math.min(totaleAnteprima - 1, Math.max(0, n - 1)));
  }

  async function handleAvvia() {
    if (!puoInviare) return;
    if (isSollecito ? !modelliLivello || !classificazione : !selectedTemplate) return;
    if (totaleInvio === 0) {
      toast.error("Nessun cliente da inviare");
      return;
    }
    setSubmitting(true);
    try {
      // Costruisci la mappa indirizzi corretti (solo quelli realmente modificati
      // rispetto al risolto, oppure quelli inseriti dove non esisteva default).
      const indirizziCorretti: Record<string, string> = {};
      for (const [cid, v] of Object.entries(overrides)) {
        const def = risolti[cid] ?? "";
        const cur = (v ?? "").trim();
        if (cur && cur !== def.trim()) indirizziCorretti[cid] = cur;
      }
      if (clienteIds.length === 0) {
        toast.error("Tutti i destinatari sono stati esclusi.");
        setSubmitting(false);
        return;
      }
      // Progressivo: si passano tutti i clienti della coda; il server ricalcola lo
      // stadio e registra i saltati con il motivo.
      const res = await avvia({
        data: {
          templateId: isSollecito ? null : selectedTemplate!.id,
          preferenzaIndirizzo: preferenza,
          nota: nota.trim() || null,
          clienteIds,
          indirizziCorretti,
          tipoCampagna: isSollecito ? "sollecito_progressivo" : tipoCampagna,
          mesi,
        },
      });
      toast.success(`Campagna avviata: ${res.totale} destinatari`);
      qc.invalidateQueries({ queryKey: ["campagne-sollecito"] });
      onOpenChange(false);
      navigate({ to: "/recupero-crediti-campagne" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Errore avvio campagna: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  const senzaIndirizzo = !indirizzoCorrente.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5" /> {tipoCampagna === "promemoria_scadenza" ? "Invio promemoria di scadenza" : "Invio massivo solleciti"}
          </DialogTitle>
          <DialogDescription>
            {tipoCampagna === "promemoria_scadenza"
              ? "Invia avvisi di cortesia sulle scadenze in arrivo. Tono amichevole, distinto dai solleciti sullo scaduto."
              : "Lancia una campagna email graduale verso più clienti, rispettando i limiti del server di posta."}
          </DialogDescription>
        </DialogHeader>

        {!puoInviare ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              L'invio delle comunicazioni di recupero è riservato al Recupero crediti.
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
            </DialogFooter>
          </div>
        ) : (
        <>
        <div className="space-y-4 py-2">
          {isSollecito && erroreModelli && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{erroreModelli}</span>
            </div>
          )}
          {/* Modalità destinatari */}
          <div className="space-y-2">
            <Label>Destinatari</Label>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as "selezionati" | "filtrati")} className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="selezionati" disabled={clienteIdsSelezionati.length === 0} />
                <ListChecks className="size-4 text-muted-foreground" />
                <span>Solo i clienti selezionati a schermo</span>
                <span className="ml-auto font-medium">{clienteIdsSelezionati.length}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="filtrati" />
                <Users className="size-4 text-muted-foreground" />
                <span>Tutti i clienti che corrispondono ai filtri correnti</span>
                <span className="ml-auto font-medium">{clienteIdsFiltrati.length}</span>
              </label>
            </RadioGroup>
          </div>

          {/* Template */}
          {isSollecito ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Il modello si sceglie da solo per ogni cliente in base all'ultimo sollecito ricevuto: 1° sollecito → 2° sollecito → Messa in mora. Tra un sollecito e il successivo devono passare almeno {giorniMinimi ?? "…"} giorni.
            </div>
          ) : (
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Seleziona un template..." /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates && templates.length === 0 && (
              <p className="text-xs text-destructive">Nessun template attivo. Creane uno in Template Email.</p>
            )}
          </div>
          )}

          {/* Preferenza indirizzo */}
          <div className="space-y-1.5">
            <Label>Indirizzo preferito</Label>
            <RadioGroup value={preferenza} onValueChange={(v) => setPreferenza(v as "email" | "pec")} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="email" /> Email
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="pec" /> PEC
              </label>
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              Se l'indirizzo preferito è vuoto, viene usato l'altro. Senza indirizzo il cliente viene marcato come "saltato_no_indirizzo" (salvo correzione qui).
            </p>
          </div>

          {/* Nota */}
          <div className="space-y-1.5">
            <Label>Nota campagna (opzionale)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es: Sollecito mensile gennaio" rows={2} />
          </div>

          {/* Avviso throttling */}
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              L'invio è graduale: ~<strong>{blocco}</strong> email ogni <strong>{pausa}s</strong>. Per{" "}
              <strong>{totaleInvio}</strong> clienti durerà circa <strong>{minutiStimati} min</strong>.
            </div>
          </div>

          {/* Riepilogo per livello (solo solleciti progressivi) */}
          {isSollecito && totale > 0 && (
            erroreStadi ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Calcolo del livello di sollecito non riuscito: {erroreStadi instanceof Error ? erroreStadi.message : String(erroreStadi)}
              </div>
            ) : !classificazione ? (
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : (
              <RiepilogoLivelli c={classificazione} giorniMinimi={giorniMinimi ?? 15} />
            )
          )}

          {/* Anteprima scorrevole */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Eye className="size-3.5" /> Anteprima destinatario
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!clienteCorrenteId) return;
                    setEsclusi((prev) => {
                      const n = new Set(prev);
                      n.add(clienteCorrenteId);
                      return n;
                    });
                    toast.success("Cliente rimosso dalla coda di invio", {
                      description: "Solo per questa campagna. Puoi ripristinarlo qui sotto.",
                    });
                  }}
                  disabled={!clienteCorrenteId}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive gap-1.5"
                >
                  <Trash2 className="size-3.5" />
                  Elimina dall'invio
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => vai(-1)} disabled={indice === 0 || totaleAnteprima === 0}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs tabular-nums px-1">
                  {totaleAnteprima === 0 ? "0 di 0" : `${indice + 1} di ${totaleAnteprima}`}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => vai(1)} disabled={indice >= totaleAnteprima - 1}>
                  <ChevronRight className="size-4" />
                </Button>
                <Input
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleJump(); } }}
                  placeholder="Vai a..."
                  className="h-8 w-20 text-xs"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Pannello esclusi */}
            {esclusi.size > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <Trash2 className="size-3.5" />
                    {esclusi.size} {esclusi.size === 1 ? "cliente escluso" : "clienti esclusi"} da questa campagna
                  </span>
                  <button
                    type="button"
                    onClick={() => setEsclusi(new Set())}
                    className="text-[11px] underline text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <RotateCcw className="size-3" /> Ripristina tutti
                  </button>
                </div>
                <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                  {Array.from(esclusi).map((cid) => (
                    <li key={cid} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-foreground/80">{nomiCache[cid] ?? stadi?.get(cid)?.ragione_sociale ?? cid.slice(0, 8)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEsclusi((prev) => {
                            const n = new Set(prev);
                            n.delete(cid);
                            return n;
                          })
                        }
                        className="text-[11px] text-primary underline hover:no-underline shrink-0"
                      >
                        Reinserisci
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground">
                  L'esclusione vale solo per questa campagna: i clienti restano selezionati nello Scadenziario.
                </p>
              </div>
            )}

            {isSollecito && (!classificazione || (!modelliLivello && !erroreModelli)) && totale > 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : totaleAnteprima === 0 ? (
              <div className="text-sm text-muted-foreground">Nessun destinatario da inviare.</div>
            ) : loadingPreview && !clientePreview ? (
              <Skeleton className="h-48 w-full" />
            ) : !clientePreview ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-2">
                {isSollecito && stadioCorrente && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Riceverà:</span>
                      <StadioSollecitoBadge stadio={stadioCorrente.livello_successivo} data={null} giorni={null} />
                      {stadioCorrente.stadio > 0 && (
                        <span className="text-muted-foreground">
                          ultimo sollecito: {STADIO_LABEL[stadioCorrente.stadio]} del {dataIt(stadioCorrente.stadio_data)}
                        </span>
                      )}
                    </div>
                    {stadioCorrente.ripetizione_mora && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <Gavel className="size-4 mt-0.5 shrink-0" />
                        <span>
                          È la seconda messa in mora: dopo l'invio il cliente verrà proposto per il passaggio al legale (Da passare all'agenzia)
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Ragione sociale</div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm font-medium break-words">
                    {clientePreview.ragione_sociale || "—"}
                  </div>
                </div>
                {/* (la rimozione dalla coda avviene tramite "Elimina dall'invio" nell'header) */}


                {/* Indirizzo editabile */}
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-2">
                    <Pencil className="size-3" /> Indirizzo di invio
                    {overrides[clienteCorrenteId ?? ""] !== undefined && (
                      <button
                        type="button"
                        onClick={resetIndirizzoCorrente}
                        className="text-[10px] text-muted-foreground underline hover:text-foreground"
                      >
                        ripristina default
                      </button>
                    )}
                  </div>
                  <Input
                    value={indirizzoCorrente}
                    onChange={(e) => setIndirizzoCorrente(e.target.value)}
                    placeholder={preferenza === "email" ? "esempio@dominio.it" : "esempio@pec.it"}
                    className={senzaIndirizzo ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {senzaIndirizzo ? (
                    <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      Nessun indirizzo — verrà saltato salvo correzione.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Default ({preferenza}): {clientePreview.email && preferenza === "email" ? clientePreview.email
                        : clientePreview.pec && preferenza === "pec" ? clientePreview.pec
                        : clientePreview.email || clientePreview.pec || "—"}
                    </p>
                  )}
                </div>

                {anteprima && (
                  <>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground mb-1">Oggetto</div>
                      <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">{anteprima.oggetto}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground mb-1">Corpo</div>
                      <div
                        className="rounded border border-border bg-background px-4 py-3 text-sm max-h-72 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: anteprima.corpo }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Riepilogo pre-invio */}
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-3.5" /> Riepilogo invio
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
              <div>{isSollecito ? "Clienti che verranno inviati:" : "Totale destinatari:"}</div><div className="text-right text-foreground font-medium">{totaleInvio}</div>
              <div>Con indirizzo (esplorati):</div><div className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{conIndirizzoVisti}</div>
              <div>Senza indirizzo (saltati):</div><div className="text-right text-destructive font-medium">{senzaIndirizzoVisti}</div>
              <div>Indirizzi corretti manualmente:</div><div className="text-right text-foreground font-medium">{numeroCorretti}</div>
              {nonEsplorati > 0 && (
                <>
                  <div>Non ancora esplorati in anteprima:</div>
                  <div className="text-right text-foreground font-medium">{nonEsplorati}</div>
                </>
              )}
            </div>
            {nonEsplorati > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Per i destinatari non esplorati l'indirizzo verrà risolto al momento dell'invio (preferenza {preferenza}, con fallback).
              </p>
            )}
            {isSollecito && classificazione && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-muted-foreground pt-1 mt-1 border-t border-border">
                <div>Saltati registrati nella campagna con il motivo:</div>
                <div className="text-right text-foreground font-medium">{saltatiRegistrati}</div>
                <div>Esclusi manualmente:</div>
                <div className="text-right text-foreground font-medium">{esclusi.size}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleAvvia} disabled={avvioDisabilitato} className="gap-1.5">
            <Send className="size-4" />
            {submitting ? "Avvio..." : `Avvia campagna (${totaleInvio})`}
          </Button>

        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
