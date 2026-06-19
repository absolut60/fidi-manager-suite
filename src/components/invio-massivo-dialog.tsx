import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, Users, ListChecks, AlertTriangle, Eye, ChevronLeft, ChevronRight, Pencil, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfig } from "@/hooks/use-config";
import { classificaScadenza } from "@/lib/scadenze";
import { renderTemplate, wrapEmailHtml, caricaSedeCliente, type TemplateEmail, type DatiTemplate } from "@/lib/template-email";
import { livelloSollecitoFromTipo } from "@/lib/template-email-render";
import { useAuth } from "@/hooks/use-auth";
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
  const { user, profilo } = useAuth();
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
  // Esclusioni manuali (check coerenza escalation)
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setNota("");
      setIndice(0);
      setJumpInput("");
      setOverrides({});
      setRisolti({});
      setEsclusi(new Set());
    } else {
      setModo(clienteIdsSelezionati.length > 0 ? "selezionati" : "filtrati");
    }
  }, [open, clienteIdsSelezionati.length]);

  const clienteIds = useMemo(
    () => (modo === "selezionati" ? clienteIdsSelezionati : clienteIdsFiltrati),
    [modo, clienteIdsSelezionati, clienteIdsFiltrati],
  );
  const totale = clienteIds.length;

  // Reset indice quando cambia il gruppo
  useEffect(() => {
    setIndice(0);
    setJumpInput("");
  }, [modo, totale]);

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
    enabled: open,
  });

  useEffect(() => {
    if (templates && templates.length && !templateId) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const selectedTemplate = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Determina il livello del template selezionato e quello precedente per il check coerenza
  const livelloCorrente = selectedTemplate
    ? livelloSollecitoFromTipo(selectedTemplate.tipo)
    : null;
  const livelloPrecedente = livelloCorrente && livelloCorrente >= 2 ? livelloCorrente - 1 : null;

  const clienteIdsKey = useMemo(() => clienteIds.join(","), [clienteIds]);

  type CoerenzaRow = {
    cliente_id: string;
    scaduto_cambiato: boolean;
    ha_azione_precedente: boolean;
    data_azione_precedente: string | null;
  };

  const { data: coerenza } = useQuery<Record<string, CoerenzaRow>>({
    queryKey: ["sollecito-massivo-coerenza", livelloPrecedente, clienteIdsKey],
    enabled: open && livelloPrecedente !== null && clienteIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, CoerenzaRow> = {};
      // chunk per evitare URL troppo lunghi
      const CHUNK = 200;
      for (let i = 0; i < clienteIds.length; i += CHUNK) {
        const slice = clienteIds.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc(
          "get_coerenza_escalation" as never,
          { _cliente_ids: slice, _livello_precedente: livelloPrecedente } as never,
        );
        if (error) throw error;
        for (const r of (data ?? []) as CoerenzaRow[]) {
          out[r.cliente_id] = r;
        }
      }
      return out;
    },
  });

  const coerenzaSummary = useMemo(() => {
    if (livelloPrecedente === null) return null;
    let cambiati = 0;
    let senzaPrec = 0;
    let coerenti = 0;
    for (const cid of clienteIds) {
      const c = coerenza?.[cid];
      if (!c) continue;
      if (!c.ha_azione_precedente) senzaPrec += 1;
      else if (c.scaduto_cambiato) cambiati += 1;
      else coerenti += 1;
    }
    return { cambiati, senzaPrec, coerenti };
  }, [clienteIds, coerenza, livelloPrecedente]);

  const clienteCorrenteId = clienteIds[indice] ?? null;
  const coerenzaCorrente = clienteCorrenteId ? coerenza?.[clienteCorrenteId] : undefined;

  // Carica on-demand i dati del cliente corrente (no precaricamento)
  const mesiKey = useMemo(() => [...mesi].sort().join(","), [mesi]);
  const { data: clientePreview, isFetching: loadingPreview } = useQuery<ClientePreviewData | null>({
    queryKey: ["sollecito-massivo-cliente", clienteCorrenteId, tipoCampagna, mesiKey],
    enabled: open && !!clienteCorrenteId,
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
        .select("numero_documento, data_documento, data_scadenza, importo_scadenza, stato_contabile, data_pagamento_effettiva, giorni_ritardo, tempi_scadenza, in_legale")
        .eq("cliente_id", id)
        .order("data_scadenza", { ascending: true });
      if (e2) throw e2;
      const oggiStr = new Date().toISOString().slice(0, 10);
      const mesiSet = new Set(mesi);
      const rilevanti = (rawScad ?? []).filter((s) => {
        if (tipoCampagna === "promemoria_scadenza") {
          // A scadere: Aperta + scadenza futura nei mesi richiesti
          if (s.stato_contabile !== "Aperta") return false;
          if ((s as { in_legale?: boolean | null }).in_legale) return false;
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
    enabled: open && !!clienteCorrenteId,
    staleTime: 60_000,
  });

  const anteprima = useMemo(() => {
    if (!selectedTemplate || !clientePreview) return null;
    const dati: DatiTemplate = {
      ...clientePreview.dati,
      nome_operatore: nomeOperatore,
    };
    const base = renderTemplate(
      { oggetto: selectedTemplate.oggetto, corpo: selectedTemplate.corpo },
      dati,
      { tipo: selectedTemplate.tipo },
    );
    const corpo = wrapEmailHtml(base.corpo, sedeCorrente ?? null, {
      nome: nomeOperatore,
      email: user?.email ?? null,
    }, { tipo: selectedTemplate.tipo });
    return { oggetto: base.oggetto, corpo };
  }, [selectedTemplate, clientePreview, sedeCorrente, nomeOperatore, user?.email]);

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
    for (const cid of clienteIds) {
      const ov = overrides[cid];
      const eff = ov !== undefined ? ov : risolti[cid];
      if (eff === undefined) continue; // non ancora caricato → non lo contiamo qui
      if (!eff || !eff.trim()) n += 1;
    }
    return n;
  }, [clienteIds, overrides, risolti]);
  const conIndirizzoVisti = useMemo(() => {
    let n = 0;
    for (const cid of clienteIds) {
      const ov = overrides[cid];
      const eff = ov !== undefined ? ov : risolti[cid];
      if (eff === undefined) continue;
      if (eff && eff.trim()) n += 1;
    }
    return n;
  }, [clienteIds, overrides, risolti]);
  const nonEsplorati = totale - conIndirizzoVisti - senzaIndirizzoVisti;

  // Throttling stima
  const blocco = Math.max(1, cfg.sollecito_massivo_blocco);
  const pausa = Math.max(0, cfg.sollecito_massivo_pausa_sec);
  const numBlocchi = Math.max(1, Math.ceil(totale / blocco));
  const secondiStimati = (numBlocchi - 1) * pausa + numBlocchi * blocco * 2;
  const minutiStimati = Math.ceil(secondiStimati / 60);

  function vai(delta: number) {
    if (!totale) return;
    setIndice((i) => Math.min(totale - 1, Math.max(0, i + delta)));
  }
  function handleJump() {
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n)) return;
    setIndice(Math.min(totale - 1, Math.max(0, n - 1)));
  }

  async function handleAvvia() {
    if (!selectedTemplate) return;
    if (totale === 0) {
      toast.error("Nessun cliente selezionato");
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
      const clienteIdsFinali = clienteIds.filter((cid) => !esclusi.has(cid));
      if (clienteIdsFinali.length === 0) {
        toast.error("Tutti i destinatari sono stati esclusi.");
        setSubmitting(false);
        return;
      }
      const res = await avvia({
        data: {
          templateId: selectedTemplate.id,
          preferenzaIndirizzo: preferenza,
          nota: nota.trim() || null,
          clienteIds: clienteIdsFinali,
          indirizziCorretti,
          tipoCampagna,
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

        <div className="space-y-4 py-2">
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
              <strong>{totale}</strong> clienti durerà circa <strong>{minutiStimati} min</strong>.
            </div>
          </div>

          {/* Anteprima scorrevole */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Eye className="size-3.5" /> Anteprima destinatario
              </Label>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => vai(-1)} disabled={indice === 0 || totale === 0}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs tabular-nums px-1">
                  {totale === 0 ? "0 di 0" : `${indice + 1} di ${totale}`}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => vai(1)} disabled={indice >= totale - 1}>
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

            {totale === 0 ? (
              <div className="text-sm text-muted-foreground">Nessun destinatario.</div>
            ) : loadingPreview && !clientePreview ? (
              <Skeleton className="h-48 w-full" />
            ) : !clientePreview ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Ragione sociale</div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                    {clientePreview.ragione_sociale || "—"}
                  </div>
                </div>

                {/* Check coerenza escalation */}
                {livelloPrecedente !== null && coerenzaCorrente && (
                  <div className="space-y-1.5">
                    {coerenzaCorrente.scaduto_cambiato && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                        <span>
                          <strong>Scaduto cambiato dal sollecito precedente — verifica.</strong>{" "}
                          Le scadenze ancora aperte non coincidono con quelle del{" "}
                          {livelloPrecedente === 1 ? "1° sollecito" : "2° sollecito"} inviato il{" "}
                          {coerenzaCorrente.data_azione_precedente
                            ? new Date(coerenzaCorrente.data_azione_precedente).toLocaleDateString("it-IT")
                            : "—"}.
                        </span>
                      </div>
                    )}
                    {!coerenzaCorrente.ha_azione_precedente && (
                      <div className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
                        <AlertCircle className="size-4 mt-0.5 shrink-0" />
                        <span>
                          Nessun {livelloPrecedente === 1 ? "1° sollecito" : "2° sollecito"} email
                          collegato a scadenze aperte trovato per questo cliente.
                        </span>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={!esclusi.has(clienteCorrenteId!)}
                        onChange={(e) => {
                          setEsclusi((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.delete(clienteCorrenteId!);
                            else n.add(clienteCorrenteId!);
                            return n;
                          });
                        }}
                      />
                      <span>Includi questo cliente nell'invio</span>
                    </label>
                  </div>
                )}

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
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
              <div>Totale destinatari:</div><div className="text-right text-foreground font-medium">{totale}</div>
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
            {coerenzaSummary && livelloPrecedente !== null && (
              <div className="pt-1 mt-1 border-t border-border space-y-0.5">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-amber-600" />
                  Coerenza con il {livelloPrecedente === 1 ? "1°" : "2°"} sollecito
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                  <div>Coerenti (scaduto invariato):</div>
                  <div className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{coerenzaSummary.coerenti}</div>
                  <div>Scaduto cambiato — verifica:</div>
                  <div className="text-right text-amber-600 dark:text-amber-400 font-medium">{coerenzaSummary.cambiati}</div>
                  <div>Senza sollecito precedente:</div>
                  <div className="text-right text-foreground font-medium">{coerenzaSummary.senzaPrec}</div>
                  <div>Esclusi manualmente:</div>
                  <div className="text-right text-foreground font-medium">{esclusi.size}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleAvvia} disabled={submitting || !templateId || totale - esclusi.size === 0} className="gap-1.5">
            <Send className="size-4" />
            {submitting ? "Avvio..." : `Avvia campagna (${totale - esclusi.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
