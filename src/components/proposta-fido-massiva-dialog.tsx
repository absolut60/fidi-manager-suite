import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { inserisciRichiesteABlocchi } from "@/lib/richieste-fido-azioni-massive";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { CambioCondizionePagamento } from "@/components/cambio-condizione-pagamento";
import { CondizionePagamentoRichiestaSelect, CondizionePagamentoTesto, useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import {
  determinaTipoRichiesta, isRichiestaAttiva, TIPO_LABEL, STATO_LABEL, STATO_TONE, formatDate,
  importoRichiestaValido, etichettaTipoRichiesta, condizionePagamentoCambiata,
  type StatoRichiesta, type TipoRichiesta,
  extraFidoTeorico, motivoExtraObbligatorio,
} from "@/lib/fidi";
import { righeVisibiliProposta, riepilogoVisibilita } from "@/lib/proposta-fido-visibilita";
import { CampoExtraTeorico } from "@/components/extra-fido-teorico";
import {
  fetchFidoTeorico, fetchFidoTeoricoPerRichiesta, fetchExtraFidoProtetti, MOTIVAZIONE_PROFILO_FIDO, isProponibile,
  REGOLA_LABEL, MOTIVO_NON_PROPONIBILE, MOTIVO_NON_PROPONIBILE_BREVE,
} from "@/lib/fido-teorico";
import { riepilogoProposte } from "@/lib/proposta-fido-riepilogo";
import { motivazioneEffettiva } from "@/lib/motivazione-proposta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Dialog "Proposta fido massiva" (spostato da src/routes/_app/clienti.tsx senza cambiare comportamento).
// selectedRows: righe clienti con almeno id, store_id, ragione_sociale, totale_rischio e FIDO_CLIENTE_SELECT.
function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}


function NotaPropostaDettaglio({ nota }: { nota: string }) {
  const [troncato, setTroncato] = useState(false);
  const testoRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = testoRef.current;
    if (!el) return;
    const verifica = () => setTroncato(el.scrollWidth > el.clientWidth + 1);
    verifica();
    const ro = new ResizeObserver(verifica);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nota]);
  return (
    <details className="min-w-0 group" data-nota-troncata={troncato || undefined}>
      <summary
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 list-none"
        style={{ cursor: troncato ? "pointer" : "default" }}
        onClick={(e) => { if (!troncato) e.preventDefault(); }}
      >
        <span ref={testoRef} className="truncate text-muted-foreground" title={nota}>{nota}</span>
        {troncato && (
          <>
            <span className="text-primary whitespace-nowrap group-open:hidden">Mostra tutto</span>
            <span className="text-primary whitespace-nowrap hidden group-open:block">Mostra meno</span>
          </>
        )}
      </summary>
      {troncato && <p className="pt-1 break-words text-muted-foreground">{nota}</p>}
    </details>
  );
}

// ============================================================================
// Dialog "Proposta fido massiva"
// ============================================================================

type RigaProposta = {
  cliente_id: string;
  store_id: string | null;
  ragione_sociale: string;
  fido_attuale: number;
  esposizione: number;
  fido_proposto: number;
  /** FM55: fido teorico della riga (non modificabile, fetchFidoTeoricoPerRichiesta); null = non disponibile. */
  fido_teorico: number | null;
  /** FM55: motivo dell'extra rispetto al teorico (obbligatorio se motivoExtraObbligatorio). */
  motivo_extra: string;
  /** Importo iniziale proposto dal sistema (per il badge "Modificato"). */
  fido_iniziale: number;
  scostamento: number;
  regola: string;
  richiede_verifica: boolean;
  nota_proposta: string;
  /** false = regola che non consente una proposta (esclusa dalla creazione) */
  proponibile: boolean;
  incluso: boolean;
  tipo: "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo";
  // Override motivazione per-riga. undefined = eredita la motivazione generale.
  motivazione?: string;
  /** Motivazione automatica dal profilo del fido teorico (MOTIVAZIONE_PROFILO_FIDO), se prevista. */
  motivazione_auto?: string;
  /** Richiesta fido attiva piu' recente (isRichiestaAttiva), se esiste. */
  richiestaInCorso?: { stato: string; tipo: string; importo: number; created_at: string };
  /** Condizione di pagamento ATTUALE del cliente (gestionale), può essere vuota. */
  cond_attuale: string;
  cond_attuale_desc?: string | null;
  /** Condizione di pagamento PROPOSTA con la richiesta ("" = nessuna). */
  cond_proposta: string;
  /** true quando cond_attuale/cond_proposta sono state inizializzate dai dati. */
  cond_init: boolean;
};

type TipoProposta = RigaProposta["tipo"];
const TIPI_PROPOSTA: TipoProposta[] = ["nuovo_fido", "aumento", "diminuzione", "rinnovo"];
const TIPI_DEFAULT: TipoProposta[] = ["nuovo_fido", "aumento", "diminuzione"];
type Tri = "escludi" | "includi" | "solo";
const FILTRI_DEFAULT = { pagImm: "includi" as Tri, fidoZero: "includi" as Tri, inCorso: "escludi" as Tri };

async function fetchRichiesteInCorso(ids: string[]): Promise<Map<string, NonNullable<RigaProposta["richiestaInCorso"]>>> {
  const map = new Map<string, NonNullable<RigaProposta["richiestaInCorso"]>>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const { data, error } = await supabase
      .from("richieste_fido")
      .select("cliente_id, stato, stato_export, tipo, importo_richiesto, created_at")
      .in("cliente_id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!r.cliente_id || !isRichiestaAttiva(r)) continue;
      const prev = map.get(r.cliente_id);
      if (!prev || String(r.created_at) > prev.created_at) {
        map.set(r.cliente_id, {
          stato: String(r.stato), tipo: String(r.tipo),
          importo: Number(r.importo_richiesto ?? 0), created_at: String(r.created_at),
        });
      }
    }
  }
  return map;
}

/** Condizione di pagamento attuale dei clienti, a blocchi di 500 (la lista non la carica sempre). */
async function fetchCondizioniClienti(ids: string[]): Promise<Map<string, { cod: string; desc: string | null }>> {
  const map = new Map<string, { cod: string; desc: string | null }>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const { data, error } = await supabase
      .from("clienti")
      .select("id, condizione_pagamento_cod, condizione_pagamento_desc, condizioni_pagamento")
      .in("id", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) map.set(r.id, { cod: String(r.condizione_pagamento_cod ?? "").trim(), desc: r.condizione_pagamento_desc ?? r.condizioni_pagamento ?? null });
  }
  return map;
}

function TriSelect({ label, value, onChange, options }: {
  label: string; value: Tri; onChange: (v: Tri) => void;
  options: { value: Tri; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-xs text-muted-foreground font-normal">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Tri)}>
        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const MOTIVAZIONE_DEFAULT = "Revisione fido massiva";

export function ProposteFidoMassivoDialog({
  open, onOpenChange, selectedRows, userId, onSuccess, onRemove, importiDaAlert,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRows: any[];
  userId: string | null;
  onSuccess: () => void;
  onRemove: (id: string) => void;
  /** Alert fidi: per questi clienti teorico di riferimento e importo iniziale = questo valore. */
  importiDaAlert?: Map<string, number>;
}) {
  const [modalitaInvio, setModalitaInvio] = useState<"bozza" | "invia">("bozza");
  const [tipoForzato, setTipoForzato] = useState<"auto" | "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo">("auto");
  const [motivazioneGenerale, setMotivazioneGenerale] = useState<string>(MOTIVAZIONE_DEFAULT);
  const [righe, setRighe] = useState<RigaProposta[]>([]);
  const [filtroTipi, setFiltroTipi] = useState<TipoProposta[]>(TIPI_DEFAULT);
  const [filtroPagImmediato, setFiltroPagImmediato] = useState<Tri>(FILTRI_DEFAULT.pagImm);
  const [filtroFidoZero, setFiltroFidoZero] = useState<Tri>(FILTRI_DEFAULT.fidoZero);
  const [filtroInCorso, setFiltroInCorso] = useState<Tri>(FILTRI_DEFAULT.inCorso);
  const [submitting, setSubmitting] = useState(false);
  // Righe modificate dall'utente: restano visibili finché non cambiano i filtri.
  const [toccate, setToccate] = useState<Set<string>>(() => new Set());
  const tocca = (id: string) => setToccate((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  useEffect(() => { setToccate(new Set()); }, [open, filtroTipi, filtroPagImmediato, filtroFidoZero, filtroInCorso]);
  const [avanzamentoCrea, setAvanzamentoCrea] = useState<{ fatte: number; totali: number } | null>(null);

  // Fido proposto = SEMPRE la RPC canonica get_fido_teorico (nessun calcolo locale)
  const ids = useMemo(() => selectedRows.map((c) => c.id as string), [selectedRows]);
  const { data: teoricoMap, isLoading: teoricoLoading, error: teoricoError } = useQuery({
    queryKey: ["fido-teorico-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeorico(ids),
  });
  // FM55: teorico di riferimento per le richieste (fonte unica: v2 per utenti in anteprima).
  const { data: teoricoRichMap, isLoading: teoricoRichLoading } = useQuery({
    queryKey: ["fido-teorico-per-richiesta", userId, [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeoricoPerRichiesta(ids, userId),
  });
  // FM55: extra approvato ancora protetto (stessa fonte di fetchFidoTeoricoPerRichiesta) → nota di riga.
  const { data: protettiMap } = useQuery({
    queryKey: ["extra-fido-protetti-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchExtraFidoProtetti(ids),
  });
  const { data: inCorsoMap } = useQuery({
    queryKey: ["richieste-in-corso-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchRichiesteInCorso(ids),
  });
  const { data: condMap } = useQuery({
    queryKey: ["condizioni-clienti-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchCondizioniClienti(ids),
  });
  const { data: codiciPagamento } = useCodiciPagamento();

  // Condizione attuale/proposta: inizializzata una sola volta per riga quando arrivano
  // condizioni cliente e codici (stessa regola del modulo singolo: proposta = attuale
  // se presente in tabella codici, altrimenti vuota). Non sovrascrive scelte dell'utente.
  useEffect(() => {
    if (!condMap || !codiciPagamento) return;
    const codici = new Set(codiciPagamento.map((c) => c.cod));
    setRighe((prev) => {
      if (!prev.some((r) => !r.cond_init)) return prev;
      return prev.map((r) => {
        if (r.cond_init) return r;
        const condizione = condMap.get(r.cliente_id);
        const att = condizione?.cod ?? "";
        return { ...r, cond_attuale: att, cond_attuale_desc: condizione?.desc, cond_proposta: att && codici.has(att) ? att : "", cond_init: true };
      });
    });
  }, [condMap, codiciPagamento, righe.length]);

  // Inizializza/aggiorna righe quando cambia la selezione o arriva il calcolo
  useEffect(() => {
    if (!open || !teoricoMap || !teoricoRichMap) return;
    setRighe((prev) => {
      const prevMap = new Map(prev.map((r) => [r.cliente_id, r]));
      return selectedRows.map((c) => {
        const existing = prevMap.get(c.id);
        if (existing) return existing;
        const t = teoricoMap.get(c.id);
        const regola = t?.regola_applicata ?? "";
        const proponibile = isProponibile(regola);
        const daAlert = importiDaAlert?.get(c.id);
        const teoricoRiga = proponibile
          ? (daAlert !== undefined ? daAlert : (teoricoRichMap.get(c.id) ?? null))
          : null;
        const proposto = teoricoRiga ?? 0;
        // Fido di riferimento = getFidoAttuale (src/lib/fido-cliente.ts), lo stesso
        // usato dalla RPC, cosi' lista, scheda cliente e proposta massiva coincidono.
        const attuale = t ? t.fido_attuale : getFidoAttuale(c);

        return {
          cliente_id: c.id,
          store_id: c.store_id ?? null,
          ragione_sociale: c.ragione_sociale,
          fido_attuale: attuale,
          esposizione: Number(c.totale_rischio ?? 0),
          fido_proposto: proposto,
          fido_teorico: teoricoRiga,
          motivo_extra: "",
          fido_iniziale: proposto,
          scostamento: t?.scostamento ?? 0,
          regola,
          richiede_verifica: !!t?.richiede_verifica,
          nota_proposta: t?.nota_proposta ?? "",
          motivazione_auto: t?.profilo ? MOTIVAZIONE_PROFILO_FIDO[t.profilo] : undefined,
          proponibile,
          incluso: proponibile,
          tipo: determinaTipoRichiesta(attuale, proposto),
          cond_attuale: "",
          cond_proposta: "",
          cond_init: false,
        };
      });
    });
  }, [open, selectedRows, teoricoMap, teoricoRichMap, importiDaAlert]);

  function toggleIncluso(id: string) {
    setRighe((prev) => prev.map((r) =>
      r.cliente_id === id && r.proponibile ? { ...r, incluso: !r.incluso } : r));
  }


  function aggiornaImporto(id: string, valore: number) {
    tocca(id);
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? {
      ...r,
      fido_proposto: valore,
      tipo: tipoForzato === "auto" ? determinaTipoRichiesta(r.fido_attuale, valore) : r.tipo,
    } : r));
  }
  function aggiornaMotivoExtra(id: string, valore: string) {
    tocca(id);
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, motivo_extra: valore } : r));
  }
  function aggiornaTipo(id: string, tipo: RigaProposta["tipo"]) {
    tocca(id);
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, tipo } : r));
  }
  function aggiornaMotivazioneRiga(id: string, valore: string | undefined) {
    tocca(id);
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, motivazione: valore } : r));
  }
  function aggiornaCondizione(id: string, cod: string) {
    tocca(id);
    setRighe((prev) => prev.map((r) => r.cliente_id === id ? { ...r, cond_proposta: cod, cond_init: true } : r));
  }
  function rimuoviRiga(id: string) {
    setRighe((prev) => prev.filter((r) => r.cliente_id !== id));
    onRemove(id);
  }

  // Quando cambia tipoForzato, ricalcola
  useEffect(() => {
    if (tipoForzato === "auto") {
      setRighe((prev) => prev.map((r) => ({ ...r, tipo: determinaTipoRichiesta(r.fido_attuale, r.fido_proposto) })));
    } else {
      setRighe((prev) => prev.map((r) => ({ ...r, tipo: tipoForzato })));
    }
  }, [tipoForzato]);

  const righeConInCorso = useMemo(
    () => righe.map((r) => ({ ...r, richiestaInCorso: inCorsoMap?.get(r.cliente_id) })),
    [righe, inCorsoMap],
  );

  const righeVisibili = useMemo(
    () => righeVisibiliProposta(righeConInCorso, {
      tipi: filtroTipi, pagImmediato: filtroPagImmediato, fidoZero: filtroFidoZero, inCorso: filtroInCorso,
    }, toccate),
    [righeConInCorso, filtroTipi, filtroPagImmediato, filtroFidoZero, filtroInCorso, toccate],
  );

  const riepilogoVis = useMemo(
    () => riepilogoVisibilita(righeConInCorso, {
      tipi: filtroTipi, pagImmediato: filtroPagImmediato, fidoZero: filtroFidoZero, inCorso: filtroInCorso,
    }, toccate, protettiMap),
    [righeConInCorso, filtroTipi, filtroPagImmediato, filtroFidoZero, filtroInCorso, toccate, protettiMap],
  );
  const [filtriAperti, setFiltriAperti] = useState(false);
  const fmtN = (n: number) => n.toLocaleString("it-IT");
  const vociNascoste: string[] = (() => {
    const n = riepilogoVis.nascosti;
    const v: string[] = [];
    if (n.rinnovo > 0) v.push(`${fmtN(n.rinnovo)} rinnov${n.rinnovo === 1 ? "o" : "i"} — il fido proposto è uguale a quello attuale, non cambia nulla`);
    if (n.protetto > 0) v.push(`${fmtN(n.protetto)} con extra approvato ancora protetto — non si riduce prima della scadenza`);
    const plur: Record<string, [string, string]> = { nuovo_fido: ["nuovo fido", "nuovi fidi"], aumento: ["aumento", "aumenti"], diminuzione: ["diminuzione", "diminuzioni"] };
    const tipi = Object.entries(riepilogoVis.tipiSpenti).filter(([, c]) => c > 0)
      .map(([t, c]) => `${fmtN(c)} ${(plur[t] ?? [TIPO_LABEL[t as TipoProposta] ?? t, TIPO_LABEL[t as TipoProposta] ?? t])[c === 1 ? 0 : 1]}`);
    if (tipi.length) v.push(`${tipi.join(" / ")} — tipo spento nel filtro`);
    if (n.in_corso > 0) v.push(`${fmtN(n.in_corso)} con richiesta già in corso — per non creare richieste doppie`);
    if (n.non_in_corso > 0) v.push(`${fmtN(n.non_in_corso)} senza richiesta in corso — filtro su "solo in corso"`);
    if (n.pag_immediato > 0) v.push(`${fmtN(n.pag_immediato)} a pagamento immediato`);
    if (n.non_pag_immediato > 0) v.push(`${fmtN(n.non_pag_immediato)} non a pagamento immediato — filtro su "solo"`);
    if (n.fido_zero > 0) v.push(`${fmtN(n.fido_zero)} con fido proposto a zero`);
    if (n.fido_non_zero > 0) v.push(`${fmtN(n.fido_non_zero)} con fido proposto diverso da zero — filtro su "solo"`);
    return v;
  })();
  const vociNonProponibili = Object.entries(riepilogoVis.nonProponibili).filter(([, c]) => c > 0)
    .map(([reg, c]) => `${fmtN(c)} ${MOTIVO_NON_PROPONIBILE_BREVE[reg] ?? MOTIVO_NON_PROPONIBILE[reg] ?? REGOLA_LABEL[reg] ?? reg}`);

  const righeVisibiliIncluse = righeVisibili.filter((r) => r.proponibile && r.incluso);
  const righeEscluse = righe.filter((r) => !r.proponibile);
  // Riepilogo del piede (fonte unica: src/lib/proposta-fido-riepilogo.ts).
  const riepilogo = riepilogoProposte(righeVisibiliIncluse);
  const nModificate = righeVisibiliIncluse.filter((r) => Number(r.fido_proposto) !== Number(r.fido_iniziale)).length;
  const righeConExtra = righeVisibiliIncluse.filter((r) => motivoExtraObbligatorio(r.fido_proposto, r.fido_teorico));
  const totaleExtra = righeConExtra.reduce((acc, r) => acc + extraFidoTeorico(r.fido_proposto, r.fido_teorico), 0);
  const tipoCount = (t: TipoProposta) => righe.filter((r) => r.tipo === t).length;
  const inCorsoCount = righeConInCorso.filter((r) => !!r.richiestaInCorso).length;
  const filtriModificati =
    filtroTipi.length !== TIPI_DEFAULT.length || !TIPI_DEFAULT.every((t) => filtroTipi.includes(t)) ||
    filtroPagImmediato !== FILTRI_DEFAULT.pagImm || filtroFidoZero !== FILTRI_DEFAULT.fidoZero ||
    filtroInCorso !== FILTRI_DEFAULT.inCorso;
  function ripristinaFiltri() {
    setFiltroTipi(TIPI_DEFAULT);
    setFiltroPagImmediato(FILTRI_DEFAULT.pagImm);
    setFiltroFidoZero(FILTRI_DEFAULT.fidoZero);
    setFiltroInCorso(FILTRI_DEFAULT.inCorso);
  }
  function toggleTipo(t: TipoProposta) {
    setFiltroTipi((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }
  const pagImmediatoCount = righe.filter((r) => r.regola === "pagamento_immediato").length;
  const fidoZeroCount = righe.filter((r) => Number(r.fido_proposto) === 0).length;

  async function creaRichieste() {
    if (righeVisibiliIncluse.length === 0) { toast.error("Nessuna riga da creare"); return; }
    if (!userId) { toast.error("Utente non autenticato"); return; }
    // Validazione preventiva (gemella del CHECK DB): se una riga non è valida non si crea nulla.
    const elencoNomi = (rs: typeof righeVisibiliIncluse) => {
      const nomi = rs.slice(0, 5).map((r) => r.ragione_sociale).join(", ");
      return rs.length > 5 ? `${nomi} (e altri ${rs.length - 5})` : nomi;
    };
    const nonNumeriche = righeVisibiliIncluse.filter((r) => {
      const v = r.fido_proposto as unknown;
      return typeof v !== "number" || !Number.isFinite(v) || v < 0;
    });
    if (nonNumeriche.length > 0) {
      toast.error(`Impossibile creare le richieste: importo mancante o non valido. Controlla: ${elencoNomi(nonNumeriche)}`);
      return;
    }
    const nonValide = righeVisibiliIncluse.filter((r) => !importoRichiestaValido(r.tipo, r.fido_proposto));
    if (nonValide.length > 0) {
      toast.error(`Impossibile creare le richieste: importo 0 ammesso solo per diminuzione o rinnovo. Controlla: ${elencoNomi(nonValide)}`);
      return;
    }
    // FM55: sopra il teorico serve il motivo dell'extra (la motivazione generale non vale).
    const senzaMotivoExtra = righeVisibiliIncluse.filter((r) =>
      motivoExtraObbligatorio(r.fido_proposto, r.fido_teorico) && r.motivo_extra.trim() === "");
    if (senzaMotivoExtra.length > 0) {
      toast.error(`Impossibile creare le richieste: manca il motivo dell'extra fido teorico. Controlla: ${elencoNomi(senzaMotivoExtra)}`);
      return;
    }
    setSubmitting(true);
    try {
      const stato = modalitaInvio === "bozza" ? "bozza" : "in_approvazione";
      // Motivazione: override per-riga se valorizzato (anche stringa vuota = override "vuoto"),
      // altrimenti motivazione generale. Stringhe vuote -> null nel DB.
      const motivazioneGeneraleNorm = motivazioneGenerale.trim() === "" ? null : motivazioneGenerale;
      const payload = righeVisibiliIncluse.map((r) => {

        const m = motivazioneEffettiva(r, motivazioneGeneraleNorm);
        return {
          cliente_id: r.cliente_id,
          store_id: r.store_id,
          tipo: r.tipo,
          importo_richiesto: r.fido_proposto,
          stato,
          created_by: userId,
          motivazione: m,
          condizione_pagamento_cod: r.cond_proposta || null,
          fido_teorico_riferimento: r.fido_teorico,
          motivo_extra_teorico: motivoExtraObbligatorio(r.fido_proposto, r.fido_teorico) ? r.motivo_extra.trim() : null,
        };
      });
      // FM50: insert a blocchi da 25 (fonte unica richieste-fido-azioni-massive).
      const { create, errori } = await inserisciRichiesteABlocchi(payload as Record<string, unknown>[],
        (fatte, totali) => setAvanzamentoCrea({ fatte, totali }));
      if (errori.length === 0) {
        toast.success(`${create.toLocaleString("it-IT")} richieste create`);
        onSuccess();
      } else {
        const nonCreate = payload.length - create;
        if (create === 0) throw new Error(errori[0]);
        toast.warning(`${create.toLocaleString("it-IT")} richieste create, ${nonCreate.toLocaleString("it-IT")} non create: ${errori[0]}. Controlla l'elenco richieste prima di riprovare.`);
        onSuccess();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("richieste_fido_importo_richiesto_check")) {
        toast.error("Impossibile creare le richieste: importo 0 ammesso solo per diminuzione o rinnovo.");
      } else if (msg.includes("richieste_fido_motivo_extra_teorico_check")) {
        toast.error("Impossibile creare le richieste: manca il motivo dell'extra fido teorico.");
      } else {
        toast.error("Errore nella creazione delle richieste: " + (msg || "errore sconosciuto"));
      }
    } finally {
      setSubmitting(false);
      setAvanzamentoCrea(null);
    }
  }

  // Pezzi condivisi tra tabella desktop e schede mobile (stessi handler)
  const renderCliente = (r: RigaProposta) => (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
      <span className="min-w-0 break-words line-clamp-2" title={r.ragione_sociale}>{r.ragione_sociale}</span>
      {r.richiede_verifica && (
        <Badge className="shrink-0 whitespace-nowrap px-1 text-[10px] bg-warning/15 text-warning hover:bg-warning/20">Da verificare</Badge>
      )}
      </div>
      {r.richiestaInCorso && (
        <div className={`mt-1 inline-block max-w-full md:max-w-[380px] whitespace-normal break-words rounded px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.richiestaInCorso.stato as StatoRichiesta] ?? "bg-muted text-muted-foreground"}`}>
          Richiesta già in corso: {STATO_LABEL[r.richiestaInCorso.stato as StatoRichiesta] ?? r.richiestaInCorso.stato}
          {" · "}{TIPO_LABEL[r.richiestaInCorso.tipo as TipoRichiesta] ?? r.richiestaInCorso.tipo} {fmtEuro(r.richiestaInCorso.importo)}
          {" · del "}{formatDate(r.richiestaInCorso.created_at)}
        </div>
      )}
    </>
  );
  const renderImporto = (r: RigaProposta, className: string) => (
    <div className="min-w-0 space-y-1">
      {r.proponibile && Number(r.fido_proposto) !== Number(r.fido_iniziale) && (
        <Badge variant="outline" className="whitespace-nowrap border-info/40 bg-info/10 px-1.5 text-[10px] text-info">Modificato</Badge>
      )}
      <Input
        type="number"
        className={`${className} text-right tabular-nums`}
        value={r.fido_proposto}
        disabled={!r.proponibile}
        aria-label={`Fido proposto per ${r.ragione_sociale}`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const valore = Number(e.currentTarget.value) || 0;
          // Normalizza anche il testo nativo: React può non riscriverlo se il numero non cambia.
          if (/^0\d/.test(e.currentTarget.value)) e.currentTarget.value = String(valore);
          aggiornaImporto(r.cliente_id, valore);
        }}
      />
      {r.proponibile && (
        <CampoExtraTeorico compatto importo={r.fido_proposto} teorico={r.fido_teorico}
          motivo={r.motivo_extra} onMotivo={(v) => aggiornaMotivoExtra(r.cliente_id, v)} />
      )}
    </div>
  );
  const renderRegola = (r: RigaProposta) =>
    r.proponibile ? (
      <span className="text-muted-foreground">{REGOLA_LABEL[r.regola] ?? r.regola ?? "—"}</span>
    ) : (
      <span className="text-warning" title={MOTIVO_NON_PROPONIBILE[r.regola] ?? ""}>
        {MOTIVO_NON_PROPONIBILE[r.regola] ?? REGOLA_LABEL[r.regola] ?? "Non proponibile"}
      </span>
    );
  const renderTipo = (r: RigaProposta, triggerClass: string) => (
    <>
      <Select value={r.tipo} disabled={!r.proponibile} onValueChange={(v) => aggiornaTipo(r.cliente_id, v as RigaProposta["tipo"])}>
        <SelectTrigger className={triggerClass}><SelectValue /></SelectTrigger>
        <SelectContent>
          {TIPI_PROPOSTA.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
        </SelectContent>
      </Select>
      {Number(r.fido_proposto) === 0 && (r.tipo === "diminuzione" || r.tipo === "rinnovo") && (
        <div className={`mt-1 text-xs ${r.tipo === "diminuzione" ? "text-warning" : "text-muted-foreground"}`}>
          {etichettaTipoRichiesta(r.tipo, 0)}
        </div>
      )}
    </>
  );
  const renderMotivazione = (r: RigaProposta) => {
    const hasOverride = r.motivazione !== undefined;
    // FM55: la motivazione automatica dal profilo vale solo con l'importo iniziale;
    // con importo modificato l'effettiva è la personalizzata se c'è, altrimenti la generale.
    const usaAuto = !!r.motivazione_auto && Number(r.fido_proposto) === Number(r.fido_iniziale);
    const effettiva = motivazioneEffettiva(r, motivazioneGenerale.trim() === "" ? null : motivazioneGenerale);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={hasOverride ? "text-primary" : ""}
            title={hasOverride ? "Motivazione personalizzata" : usaAuto ? "Motivazione automatica dal profilo" : "Eredita motivazione generale"}
          >
            <MessageSquare className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="end">
          <div className="space-y-2">
            <Label className="text-xs">Motivazione per questo cliente</Label>
            <Textarea
              value={hasOverride ? r.motivazione ?? "" : (effettiva ?? "")}
              onChange={(e) => aggiornaMotivazioneRiga(r.cliente_id, e.target.value)}
              placeholder="Lascia vuoto per ereditare quella generale"
              className="min-h-20"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {hasOverride ? "Personalizzata" : usaAuto ? "Automatica dal profilo" : "Eredita generale"}
              </span>
              {hasOverride && (
                <Button variant="ghost" size="sm" onClick={() => aggiornaMotivazioneRiga(r.cliente_id, undefined)}>
                  Reimposta
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };
  const renderCondizione = (r: RigaProposta) => (
    <div className="min-w-0 [&_button[role=combobox]]:h-auto [&_button[role=combobox]]:min-h-10 [&_button[role=combobox]]:whitespace-normal [&_button[role=combobox]>span]:flex-wrap [&_button[role=combobox]>span>span:first-child]:whitespace-normal [&_button[role=combobox]>span>span:first-child]:text-left">
      <CondizionePagamentoRichiestaSelect size="sm" value={r.cond_proposta}
        onChange={(cod) => aggiornaCondizione(r.cliente_id, cod)} />
    </div>
  );
  const renderDettagli = (r: RigaProposta) => {
    const cambio = condizionePagamentoCambiata(r.cond_proposta, r.cond_attuale);
    const mot = r.proponibile && r.incluso
      ? motivazioneEffettiva(r, motivazioneGenerale.trim() === "" ? null : motivazioneGenerale)
      : null;
    const prot = protettiMap?.get(r.cliente_id);
    if (!r.nota_proposta && !cambio && !mot && !prot) return null;
    return (
      <div className={`grid grid-cols-1 gap-2 text-xs ${cambio ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        {r.nota_proposta && (
          <div className="min-w-0">
            <NotaPropostaDettaglio nota={r.nota_proposta} />
          </div>
        )}
        {prot && (
          <p className="min-w-0 break-words text-[11px] text-success">
            Extra approvato il {new Date(prot.approvata_il).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" })}: protetto fino al {prot.protetto_fino_al.split("-").reverse().join("/")}
          </p>
        )}
        {mot && (
          <p className="min-w-0 break-words text-[11px] text-muted-foreground">
            <span className="font-medium">Motivazione:</span> {mot}
          </p>
        )}
        {cambio && (
          <div className="min-w-0 break-words text-info xl:text-right">
            <CambioCondizionePagamento variant="badge" codAttuale={r.cond_attuale} codProposta={r.cond_proposta} descAttuale={r.cond_attuale_desc} />
            {" "}<CondizionePagamentoTesto cod={r.cond_attuale} descFallback={r.cond_attuale_desc} /> → <CondizionePagamentoTesto cod={r.cond_proposta} />
          </div>
        )}
      </div>
    );
  };
  const renderRimuovi = (r: RigaProposta) => (
    <Button variant="ghost" size="icon" onClick={() => rimuoviRiga(r.cliente_id)} title="Rimuovi">
      <X className="size-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-7xl h-[90dvh] max-h-[90dvh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="shrink-0 min-w-0 border-b px-3 py-2 sm:px-4 sm:py-2">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words">Proposta fido massiva — {righeVisibiliIncluse.length} clienti</DialogTitle>
          <DialogDescription>
            L'importo proposto è il fido teorico calcolato dal sistema (fatturato + condizione di pagamento).
          </DialogDescription>
        </DialogHeader>

        {(teoricoLoading || teoricoRichLoading) && (
          <p className="text-sm text-muted-foreground">Calcolo del fido teorico in corso…</p>
        )}
        {teoricoError && (
          <p className="text-sm text-destructive">
            Impossibile calcolare il fido teorico: {(teoricoError as any)?.message ?? "errore"}
          </p>
        )}
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1 break-words">
          <p className="text-foreground">
            Stai vedendo <strong>{fmtN(riepilogoVis.visibili)}</strong> propost{riepilogoVis.visibili === 1 ? "a" : "e"} su <strong>{fmtN(riepilogoVis.totale)}</strong> clienti selezionati.
          </p>
          {vociNascoste.length > 0 && (
            <div>
              <span className="font-medium text-foreground">Nascosti dai filtri:</span>
              <ul className="ml-4 list-disc">
                {vociNascoste.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          )}
          {riepilogoVis.nonProponibiliTotale > 0 && (
            <p>
              <span className="font-medium text-warning">Non proponibili (esclusi sempre): {fmtN(riepilogoVis.nonProponibiliTotale)}</span>
              {" — "}{vociNonProponibili.join(" · ")}
            </p>
          )}
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setFiltriAperti(true)}>
            Cambia filtri
          </Button>
        </div>

        <FiltriCollassabili ancheDesktop aperto={filtriAperti} onApertoChange={setFiltriAperti}
          attivi={Number(filtroTipi.length !== TIPI_DEFAULT.length || !TIPI_DEFAULT.every((t) => filtroTipi.includes(t))) + Number(filtroPagImmediato !== FILTRI_DEFAULT.pagImm) + Number(filtroFidoZero !== FILTRI_DEFAULT.fidoZero) + Number(filtroInCorso !== FILTRI_DEFAULT.inCorso)}
          riepilogo={<span className="text-xs text-muted-foreground break-words">Mostrati {righeVisibili.length} di {righe.length} clienti · {righeVisibiliIncluse.length} inclusi nella creazione</span>}
          azioni={filtriModificati && <Button type="button" variant="link" size="sm" onClick={ripristinaFiltri}>Ripristina filtri</Button>}>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs text-muted-foreground font-normal">Tipo proposta</Label>
              <div className="flex flex-wrap gap-1.5">
                {TIPI_PROPOSTA.map((t) => {
                  const attivo = filtroTipi.includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={attivo ? "default" : "outline"}
                      aria-pressed={attivo}
                      className="h-9 px-2.5 text-xs"
                      onClick={() => toggleTipo(t)}
                    >
                      {TIPO_LABEL[t]} ({tipoCount(t)})
                    </Button>
                  );
                })}
              </div>
            </div>
            <TriSelect
              label="Pagamento immediato"
              value={filtroPagImmediato}
              onChange={setFiltroPagImmediato}
              options={[
                { value: "escludi", label: `Escludi (${pagImmediatoCount})` },
                { value: "includi", label: "Includi" },
                { value: "solo", label: `Solo (${pagImmediatoCount})` },
              ]}
            />
            <TriSelect
              label="Fido proposto a zero"
              value={filtroFidoZero}
              onChange={setFiltroFidoZero}
              options={[
                { value: "includi", label: "Includi" },
                { value: "escludi", label: `Escludi (${fidoZeroCount})` },
                { value: "solo", label: `Solo (${fidoZeroCount})` },
              ]}
            />
            <TriSelect
              label="Richiesta in corso"
              value={filtroInCorso}
              onChange={setFiltroInCorso}
              options={[
                { value: "escludi", label: `Escludi (${inCorsoCount})` },
                { value: "includi", label: "Mostra" },
                { value: "solo", label: `Solo (${inCorsoCount})` },
              ]}
            />
          </div>
        </FiltriCollassabili>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
          <div className="min-w-0">
            <Label className="text-xs">Tipo richiesta applicato a tutti</Label>
            <Select value={tipoForzato} onValueChange={(v) => setTipoForzato(v as any)}>
              <SelectTrigger className="mt-1 h-10 w-full min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatico (in base al fido attuale)</SelectItem>
                {TIPI_PROPOSTA.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        <div className="min-w-0">
          <Label className="text-xs">Motivazione (applicata a tutti)</Label>
          <Textarea
            value={motivazioneGenerale}
            onChange={(e) => setMotivazioneGenerale(e.target.value)}
            placeholder="Motivazione comune a tutte le richieste del batch"
            rows={1} className="mt-1 h-10 min-h-10 focus:h-20 resize-none"
          />
        </div>
        </div>
        </div>
        <div data-proposte-elenco className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 sm:px-4 sm:py-2">
        {/* Schede anche su tablet: la tabella estesa richiede spazio desktop. */}
        <div className="[&>div]:block xl:hidden [&>div>div>div:first-child]:grid [&>div>div>div:first-child]:grid-cols-1 [&>div>div>div:first-child>div:last-child]:justify-end">
        <ElencoSchede>
          {righeVisibili.map((r) => {
            const scost = r.proponibile ? r.fido_proposto - r.fido_attuale : 0;
            return (
              <SchedaLista
                key={r.cliente_id}
                className={`${!r.proponibile ? "opacity-60" : ""} ${
                  r.proponibile && r.richiede_verifica ? "bg-warning/10 border-l-2 border-l-warning" : ""
                }`}
                selezione={{ checked: r.incluso && r.proponibile, onChange: () => { if (r.proponibile) toggleIncluso(r.cliente_id); } }}
                titolo={renderCliente(r)}
                badge={
                  <div className="flex shrink-0 items-center">
                    {renderMotivazione(r)}
                    {renderRimuovi(r)}
                  </div>
                }
                campi={[
                  { etichetta: "Fido attuale", valore: fmtEuro(r.fido_attuale) },
                  { etichetta: "Esposizione", valore: fmtEuro(r.esposizione) },
                  {
                    etichetta: "Scostamento",
                    valore: (
                      <span className={`tabular-nums ${scost > 0 ? "text-success" : scost < 0 ? "text-warning" : "text-muted-foreground"}`}>
                        {r.proponibile ? `${scost > 0 ? "+" : ""}${fmtEuro(scost)}` : "—"}
                      </span>
                    ),
                  },
                  { etichetta: "Regola", valore: <span className="text-xs">{renderRegola(r)}</span> },
                ]}
                footer={
                  <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">Fido proposto</Label>
                      {renderImporto(r, "h-10 w-full text-right")}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">Tipo</Label>
                      {renderTipo(r, "h-10 w-full")}
                    </div>
                    <div className="min-w-0 space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground font-normal">Cond. pagamento</Label>
                      {renderCondizione(r)}
                    </div>
                    {renderDettagli(r) ? <div className="min-w-0 sm:col-span-2">{renderDettagli(r)}</div> : null}
                  </div>
                }
              />
            );
          })}
        </ElencoSchede>
        </div>

        <div className="hidden xl:block min-w-0 [&>div]:overflow-x-visible">
          <Table className="table-fixed w-full text-xs [&_th]:px-1 [&_td]:px-1 [&_th]:whitespace-normal [&_td]:whitespace-normal">
            <colgroup>
              <col className="w-8" /><col /><col className="w-16" /><col className="w-16" />
              <col className="w-64" /><col className="w-20" /><col className="w-52" />
              <col className="w-36" /><col className="w-8" /><col className="w-8" />
            </colgroup>
            <TableHeader><TableRow>
              <TableHead /><TableHead>Cliente</TableHead><TableHead className="text-right">Fido attuale</TableHead>
              <TableHead className="text-right">Esposizione</TableHead><TableHead className="text-right">Fido proposto</TableHead>
              <TableHead className="text-right">Scostamento</TableHead><TableHead>Condizione di pagamento</TableHead>
              <TableHead>Tipo</TableHead><TableHead>Mot.</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {righeVisibili.map((r) => {
                const scost = r.proponibile ? r.fido_proposto - r.fido_attuale : 0;
                const dettagli = renderDettagli(r);
                return (
                  <Fragment key={r.cliente_id}>
                    <TableRow className={`${!r.proponibile ? "opacity-60" : ""} ${r.proponibile && r.richiede_verifica ? "bg-warning/10" : ""} ${dettagli ? "border-0" : "border-b-2 border-border"}`}>
                      <TableCell><Checkbox checked={r.incluso && r.proponibile} disabled={!r.proponibile} onCheckedChange={() => toggleIncluso(r.cliente_id)} /></TableCell>
                      <TableCell className="min-w-0 font-medium">{renderCliente(r)}<div className="mt-0.5 text-[11px] font-normal">{renderRegola(r)}</div></TableCell>
                      <TableCell className="text-right break-words tabular-nums">{fmtEuro(r.fido_attuale)}</TableCell>
                      <TableCell className="text-right break-words tabular-nums">{fmtEuro(r.esposizione)}</TableCell>
                      <TableCell>{renderImporto(r, "h-10 w-full min-w-0 px-1 text-xs text-right")}</TableCell>
                      <TableCell className={`text-right break-words tabular-nums ${scost > 0 ? "text-success" : scost < 0 ? "text-warning" : "text-muted-foreground"}`}>{r.proponibile ? `${scost > 0 ? "+" : ""}${fmtEuro(scost)}` : "—"}</TableCell>
                      <TableCell>{renderCondizione(r)}</TableCell>
                      <TableCell>{renderTipo(r, "h-10 w-full min-w-0 px-1 text-xs")}</TableCell>
                      <TableCell><div className="[&_button]:w-8 [&_button]:h-10">{renderMotivazione(r)}</div></TableCell>
                      <TableCell><div className="[&_button]:w-8 [&_button]:h-10">{renderRimuovi(r)}</div></TableCell>
                    </TableRow>
                    {dettagli && <TableRow className={`${!r.proponibile ? "opacity-60" : ""} ${r.proponibile && r.richiede_verifica ? "bg-warning/10" : ""} border-b-2 border-border`}><TableCell colSpan={10} className="pt-0 pb-2">{dettagli}</TableCell></TableRow>}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </div>

        <div className="shrink-0 min-w-0 border-t bg-background px-3 py-2 sm:px-4 sm:py-2 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium break-words">
            Fido attuale: <strong className="tabular-nums">{fmtEuro(riepilogo.totaleAttuale)}</strong>
            {" → "}Nuovo fido: <strong className="tabular-nums">{fmtEuro(riepilogo.totaleProposto)}</strong>
            {" · Differenza: "}
            <strong className={`tabular-nums ${riepilogo.differenza > 0 ? "text-success" : riepilogo.differenza < 0 ? "text-warning" : ""}`}>
              {riepilogo.differenza > 0 ? "+" : riepilogo.differenza < 0 ? "−" : "±"}{fmtEuro(Math.abs(riepilogo.differenza))}
            </strong>
            {" · "}{righeVisibiliIncluse.length} richieste da creare
            {nModificate > 0 && <> · {nModificate} modificat{nModificate === 1 ? "a" : "e"} a mano</>}
            {righeConExtra.length > 0 && (
              <span className="text-warning"> · di cui extra fido teorico: <strong className="tabular-nums">{fmtEuro(totaleExtra)}</strong> su {righeConExtra.length} client{righeConExtra.length === 1 ? "e" : "i"}</span>
            )}
            {righeEscluse.length > 0 && (
              <span className="text-muted-foreground font-normal"> · {righeEscluse.length} esclusi</span>
            )}
          </div>
          {riepilogo.dettaglio.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              {riepilogo.dettaglio.map((d, i) => (
                <Fragment key={d.tipo}>
                  {i > 0 && <span aria-hidden="true">|</span>}
                  <span className="whitespace-nowrap tabular-nums">
                    {d.tipo === "aumento" ? "Aumenti" : d.tipo === "diminuzione" ? "Diminuzioni" : "Nuovi fidi"}: {d.n} · {d.somma >= 0 ? "+" : "−"}{fmtEuro(Math.abs(d.somma))}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
          </div>
          <div className="text-xs text-info lg:col-start-1">
            {righeVisibiliIncluse.filter((r) => condizionePagamentoCambiata(r.cond_proposta, r.cond_attuale)).length > 0 &&
              <>{righeVisibiliIncluse.filter((r) => condizionePagamentoCambiata(r.cond_proposta, r.cond_attuale)).length} con cambio di condizione di pagamento</>}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:items-center lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="col-span-2 min-w-0">
              <Label className="text-xs">Modalità invio</Label>
              <div className="grid grid-cols-2 gap-0.5 rounded-md border p-0.5" role="group" aria-label="Modalità invio">
                <Button type="button" size="sm" variant={modalitaInvio === "bozza" ? "secondary" : "ghost"} aria-pressed={modalitaInvio === "bozza"} className="h-10 px-2 text-xs" onClick={() => setModalitaInvio("bozza")}>Salva come bozza</Button>
                <Button type="button" size="sm" variant={modalitaInvio === "invia" ? "secondary" : "ghost"} aria-pressed={modalitaInvio === "invia"} className="h-10 px-2 text-xs" onClick={() => setModalitaInvio("invia")}>Invia subito<span className="sr-only"> all'approvazione</span></Button>
              </div>
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={submitting}>Annulla</Button>
            <Button className="w-full sm:w-auto" onClick={creaRichieste} disabled={submitting || righeVisibiliIncluse.length === 0}>
              {submitting ? (avanzamentoCrea ? `Creazione: ${avanzamentoCrea.fatte.toLocaleString("it-IT")} di ${avanzamentoCrea.totali.toLocaleString("it-IT")}…` : "Creazione…") : `Crea ${righeVisibiliIncluse.length} richieste`}
            </Button>
          </DialogFooter>
        </div>


      </DialogContent>
    </Dialog>
  );
}
