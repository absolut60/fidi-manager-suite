import { SezioneCervedCompatta } from "@/components/cerved/sezione-cerved-compatta";
import { useCervedCompattoClienti } from "@/hooks/use-cerved-compatto-clienti";
import { BadgeMotiviRiga, DettagliRiga } from "@/components/badge-motivi-riga";
import { chiaveRiferimentoRichiestaMassiva } from "@/lib/chiavi-cache-fido";
import { useLockRicalcoloFido } from "@/components/ricalcolo-fido-barra";
import { SemaforoPallino } from "@/components/semaforo-pallino";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SchedaLista, ElencoSchede } from "@/components/lista-responsive";
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
import { daValutareProposta, categoriaProposta, CATEGORIE_PROPOSTA_DEFAULT, testoMotivoDaGuardare, righeVisibiliProposta, riepilogoVisibilita, inclusoInizialeProposta, livelloControlloProposta, motivoRigaProposta, type CategoriaProposta, type LivelloControllo } from "@/lib/proposta-fido-visibilita";
import { segnalazioniAnomalia, anomaliaRossa } from "@/lib/fido-segnalazioni";
import { alertConsumoAperto, fetchAlertFidiAperti, giaDeciso, teoricoPropostaIniziale } from "@/lib/alert-fidi";
import { Switch } from "@/components/ui/switch";
import { CampoExtraTeorico } from "@/components/extra-fido-teorico";
import {
  fetchFidoTeorico, fetchFidoTeoricoPerRichiesta, fetchExtraFidoProtetti, fetchFidiInAttesaGamma, fetchSogliaConsumoFido, fidoPerTornareSottoSoglia, notaExtraProtetto, MOTIVAZIONE_PROFILO_FIDO, isProponibile,
  REGOLA_LABEL, MOTIVO_NON_PROPONIBILE, MOTIVO_NON_PROPONIBILE_BREVE, isSedeCentraleFido,
} from "@/lib/fido-teorico";
import { CLASSI_MOTIVO_RIGA, LEGENDA_MOTIVI } from "@/lib/proposta-fido-riga";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Dialog "Proposta fido massiva" (spostato da src/routes/_app/clienti.tsx senza cambiare comportamento).
// selectedRows: righe clienti con almeno id, store_id, ragione_sociale, totale_rischio e FIDO_CLIENTE_SELECT.
function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions).format(n);
}


// ============================================================================
// Dialog "Proposta fido massiva"
// ============================================================================

type RigaProposta = {
  cliente_id: string;
  store_id: string | null;
  ragione_sociale: string;
  /** Nome del punto vendita (se caricato con la lista). */
  negozio?: string | null;
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
  segnalazioni?: string[];
  alertAperto?: boolean;
  /** Riga da controllare (segnalazioni arancioni/rosse). */
  controllo?: LivelloControllo;
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

const MOTIVAZIONE_DEFAULT = "Revisione fido massiva";

export function ProposteFidoMassivoDialog({
  open, onOpenChange, selectedRows, userId, onSuccess, onRemove, importiDaAlert, mostraSempre,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRows: any[];
  userId: string | null;
  onSuccess: () => void;
  onRemove: (id: string) => void;
  /** Alert fidi: per questi clienti teorico di riferimento e importo iniziale = questo valore. */
  importiDaAlert?: Map<string, number>;
  /** Clienti scelti da Alert fidi: sempre visibili anche se rinnovi, salvo richiesta già in corso. */
  mostraSempre?: string[];
}) {
  const mostraSempreSet = useMemo(() => new Set(mostraSempre ?? []), [mostraSempre]);
  const [soloControllo, setSoloControllo] = useState(false);
  const [dettagliAperti, setDettagliAperti] = useState(false);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(min-width: 640px)");
    const aggiorna = () => setDettagliAperti(media.matches);
    aggiorna();
    media.addEventListener("change", aggiorna);
    return () => media.removeEventListener("change", aggiorna);
  }, [open]);
  const [modalitaInvio, setModalitaInvio] = useState<"bozza" | "invia">("bozza");
  const [tipoForzato, setTipoForzato] = useState<"auto" | "nuovo_fido" | "aumento" | "diminuzione" | "rinnovo">("auto");
  const [motivazioneGenerale, setMotivazioneGenerale] = useState<string>(MOTIVAZIONE_DEFAULT);
  const [righe, setRighe] = useState<RigaProposta[]>([]);
  const [filtroTipi, setFiltroTipi] = useState<CategoriaProposta[]>(CATEGORIE_PROPOSTA_DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  // Righe modificate dall'utente: restano visibili finché non cambiano i filtri.
  const [toccate, setToccate] = useState<Set<string>>(() => new Set());
  const tocca = (id: string) => setToccate((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  useEffect(() => { setToccate(new Set()); }, [open, filtroTipi]);
  const ricalcoloInCorso = useLockRicalcoloFido()?.tipo === "attivo";
  const [avanzamentoCrea, setAvanzamentoCrea] = useState<{ fatte: number; totali: number } | null>(null);

  // Fido proposto = SEMPRE la RPC canonica get_fido_teorico (nessun calcolo locale)
  const clientiNelGiro = useMemo(() => selectedRows.filter((c) => !isSedeCentraleFido(c)), [selectedRows]);
  const ids = useMemo(() => clientiNelGiro.map((c) => c.id as string), [clientiNelGiro]);
  const { data: teoricoMap, isLoading: teoricoLoading, error: teoricoError } = useQuery({
    queryKey: ["fido-teorico-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeorico(ids),
  });
  // FM55: teorico di riferimento per le richieste (fonte unica fetchFidoTeoricoPerRichiesta).
  const { data: teoricoRichMap, isLoading: teoricoRichLoading } = useQuery({
    queryKey: chiaveRiferimentoRichiestaMassiva(userId, ids),
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchFidoTeoricoPerRichiesta(ids, userId),
  });
  // Sezione Cerved compatta: una lettura batch per tutte le righe (Record, chiave dedicata).
  const { data: cervedCompatto } = useCervedCompattoClienti(ids, open);
  // FM55: extra approvato ancora protetto (stessa fonte di fetchFidoTeoricoPerRichiesta) → nota di riga.
  const { data: protettiMap } = useQuery({
    queryKey: ["extra-fido-protetti-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchExtraFidoProtetti(ids),
  });
  // Lettura condivisa: include lo stato delle richieste aggiornato dal vivo.
  const { data: alertMassiva } = useQuery({
    queryKey: ["alert-fidi-aperti-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 60_000,
    queryFn: fetchAlertFidiAperti,
  });
  const alertAperti = useMemo(() => {
    if (!alertMassiva || !teoricoMap || !teoricoRichMap || !protettiMap) return undefined;
    return new Set(alertMassiva.filter((a) => alertConsumoAperto({ ...a,
      gia_deciso: giaDeciso(protettiMap?.get?.(a.cliente_id), teoricoRichMap?.get?.(a.cliente_id),
        teoricoMap?.get?.(a.cliente_id)?.fido_attuale ?? a.cliente?.fido_gestionale ?? a.fido_gamma),
    })).map((a) => a.cliente_id));
  }, [alertMassiva, teoricoMap, teoricoRichMap, protettiMap]);
  const { data: sogliaConsumo } = useQuery({
    queryKey: ["soglia-consumo-fido"],
    enabled: open,
    staleTime: 10 * 60_000,
    queryFn: fetchSogliaConsumoFido,
  });
  // FM55 fetta 9: fidi già approvati che Gamma non ha ancora recepito (fonte SQL unica).
  const { data: inAttesaGammaMap } = useQuery({
    queryKey: ["fidi-in-attesa-gamma-massivo", [...ids].sort().join(",")],
    enabled: open && ids.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchFidiInAttesaGamma(ids),
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
    if (!open || !teoricoMap || !teoricoRichMap || !alertAperti || !inCorsoMap) return;
    setRighe((prev) => {
      const prevMap = new Map(prev.map((r) => [r.cliente_id, r]));
      return clientiNelGiro.filter((c) => teoricoMap.get(c.id)?.regola_applicata !== "sede_esclusa").map((c) => {
        const existing = prevMap.get(c.id);
        if (existing) return existing;
        const t = teoricoMap.get(c.id);
        const regola = t?.regola_applicata ?? "";
        const proponibile = isProponibile(regola);
        const teoricoRiga = teoricoPropostaIniziale(proponibile, importiDaAlert?.get(c.id), teoricoRichMap.get(c.id));
        const proposto = teoricoRiga ?? 0;
        // Fido di riferimento = getFidoAttuale (src/lib/fido-cliente.ts), lo stesso
        // usato dalla RPC, cosi' lista, scheda cliente e proposta massiva coincidono.
        const attuale = t ? t.fido_attuale : getFidoAttuale(c);
        const tipo = determinaTipoRichiesta(attuale, proposto);
        const anom = segnalazioniAnomalia(t?.segnalazioni);
        const controllo = livelloControlloProposta(anom.length, anomaliaRossa(t?.segnalazioni));

        return {
          cliente_id: c.id,
          store_id: c.store_id ?? null,
          ragione_sociale: c.ragione_sociale,
          negozio: c.stores?.nome ?? null,
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
          incluso: inclusoInizialeProposta({ proponibile, rossa: anomaliaRossa(t?.segnalazioni), regola,
            fidoAttuale: attuale, fidoProposto: proposto, segnalazioni: t?.segnalazioni }),
          segnalazioni: t?.segnalazioni ?? [],
          alertAperto: alertAperti.has(c.id),
          controllo,
          tipo,
          cond_attuale: "",
          cond_proposta: "",
          cond_init: false,
        };
      });
    });
  }, [open, clientiNelGiro, teoricoMap, teoricoRichMap, importiDaAlert, alertAperti, inCorsoMap]);

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
    () => righe.map((r) => ({ ...r, richiestaInCorso: inCorsoMap?.get(r.cliente_id),
      protezione: protettiMap?.get(r.cliente_id), riferimentoRichiesta: teoricoRichMap?.get(r.cliente_id),
      inAttesaGamma: inAttesaGammaMap?.get(r.cliente_id),
    })),
    [righe, inCorsoMap, protettiMap, teoricoRichMap, inAttesaGammaMap],
  );

  const righeVisibiliTutte = useMemo(
    () => righeVisibiliProposta(righeConInCorso, {
      tipi: filtroTipi,
    }, toccate, mostraSempreSet),
    [righeConInCorso, filtroTipi, toccate, mostraSempreSet],
  );
  const nDaControllare = righeVisibiliTutte.filter((r) => r.proponibile && r.controllo).length;
  const righeVisibili = soloControllo ? righeVisibiliTutte.filter((r) => r.proponibile && r.controllo) : righeVisibiliTutte;

  const riepilogoVis = useMemo(
    () => riepilogoVisibilita(righeConInCorso, {
      tipi: filtroTipi,
    }, toccate, mostraSempreSet),
    [righeConInCorso, filtroTipi, toccate, mostraSempreSet],
  );
  const fmtN = (n: number) => n.toLocaleString("it-IT");
  const vociNascoste: string[] = (() => {
    const n = riepilogoVis.nascosti;
    const v: string[] = [];
    for (const [fino, numero] of Object.entries(riepilogoVis.giaDecisiPerScadenza).sort(([a], [b]) => a.localeCompare(b))) {
      v.push(`${fmtN(numero)} già decisi (protetti fino al ${fino.slice(8, 10)}/${fino.slice(5, 7)})`);
    }
    if (n.in_corso > 0) v.push(`Non vedi ${fmtN(n.in_corso)} clienti che hanno già una richiesta in corso.`);
    if (n.in_attesa_gamma > 0) v.push(`Già approvati, in attesa di Gamma (${fmtN(n.in_attesa_gamma)})`);
    const nomi: Record<string, string> = { aumento: "aumenti", diminuzione: "riduzioni", nuovo_fido: "nuovi fidi", rinnovo_da_guardare: "fidi invariati da guardare" };
    for (const [tipo, numero] of Object.entries(riepilogoVis.tipiSpenti)) {
      if (numero > 0) v.push(`Non vedi ${fmtN(numero)} ${nomi[tipo] ?? tipo}: hai tolto la spunta in «Cosa vuoi mandare».`);
    }
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
  const tipoCount = (t: CategoriaProposta) => t === "rinnovo_da_guardare" ? riepilogoVis.daDecidere
    : t === "rinnovo" ? riepilogoVis.altriRinnovi : righeConInCorso.filter((r) => r.proponibile && !r.richiestaInCorso && !r.inAttesaGamma && categoriaProposta(r) === t).length;
  function toggleTipo(t: CategoriaProposta) {
    setFiltroTipi((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

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

  // Colore della riga in base al motivo vincente (fonte unica: motivoRigaProposta).
  const classiRiga = (r: RigaProposta) => {
    if (!r.proponibile) return "";
    const { motivo } = motivoRigaProposta({ regola: r.regola, segnalazioni: r.segnalazioni });
    if (!motivo) return "";
    const c = CLASSI_MOTIVO_RIGA[motivo];
    return `${c.bordo} ${c.sfondo}`;
  };

  // Pezzi condivisi tra tabella desktop e schede mobile (stessi handler)
  const renderCliente = (r: RigaProposta) => {
    return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
      <span className="flex min-w-0 items-start gap-2">
        <SemaforoPallino cliente={{ fido_teorico_cliente: teoricoMap?.get(r.cliente_id) }} className="mt-1" />
        <span className="min-w-0 break-words line-clamp-2" title={r.ragione_sociale}>
          {r.ragione_sociale}{r.negozio && <span className="font-normal text-muted-foreground"> · {r.negozio}</span>}
        </span>
      </span>
      {r.proponibile && (
        <span className="flex max-w-[45%] flex-wrap justify-end gap-1">
          <BadgeMotiviRiga regola={r.regola} segnalazioni={r.segnalazioni} />
        </span>
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
  };
  const renderCasella = (r: RigaProposta, className: string) => (
      <Input
        type="number"
        inputMode="numeric"
        className={`${className} tabular-nums`}
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
  );
  /** Riga semplice: numeri → casella → differenza, una frase, ▸ dettagli. */
  const renderCorpo = (r: RigaProposta, casellaClass: string) => {
    const scost = r.proponibile ? r.fido_proposto - r.fido_attuale : 0;
    const teo = teoricoMap?.get(r.cliente_id);
    const esposizione = teo?.esposizione_corrente ?? r.esposizione;
    const ordini = Number(teo?.ordini_aperti ?? 0);
    const { frase, perCoprire } = motivoRigaProposta({ regola: r.regola, segnalazioni: r.segnalazioni,
      dati: r.proponibile && teo ? { ...teo, fidoAttuale: r.fido_attuale, consigliato: r.fido_iniziale } : undefined });
    const dettagli = renderDettagli(r);
    return (
      <div className="min-w-0 space-y-1 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
          <span>Fido attuale <strong className="font-medium">{fmtEuro(r.fido_attuale)}</strong></span>
          <span aria-hidden className="text-muted-foreground">|</span>
          <span>Ci deve <strong className="font-medium">{fmtEuro(esposizione)}</strong>
            {ordini > 0 && <> + ordini <strong className="font-medium">{fmtEuro(ordini)}</strong></>}
          </span>
          <span aria-hidden className="text-muted-foreground">|</span>
          <span className={perCoprire === r.fido_teorico ? "text-muted-foreground" : ""}>Per coprire <strong className="font-medium">{perCoprire == null ? "—" : fmtEuro(perCoprire)}</strong></span>
          <span aria-hidden className="text-muted-foreground">|</span>
          <span>Consigliato <strong>{r.proponibile && r.fido_teorico != null ? fmtEuro(r.fido_teorico) : "—"}</strong></span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="text-muted-foreground">→</span>
            {renderCasella(r, casellaClass)}
            <span className={`whitespace-nowrap ${scost > 0 ? "text-success" : scost < 0 ? "text-warning" : "text-muted-foreground"}`}>
              {r.proponibile ? `${scost > 0 ? "+" : scost < 0 ? "−" : ""}${fmtEuro(Math.abs(scost))}` : "—"}
            </span>
            {r.proponibile && Number(r.fido_proposto) !== Number(r.fido_iniziale) && (
              <Badge variant="outline" className="whitespace-nowrap border-info/40 bg-info/10 px-1.5 text-[10px] text-info">Modificato</Badge>
            )}
          </span>
        </div>
        <SezioneCervedCompatta dati={cervedCompatto?.[r.cliente_id]} fidoAttuale={r.fido_attuale} clienteId={r.cliente_id} className="w-fit max-w-full" />
        {r.proponibile && (
          <CampoExtraTeorico compatto importo={r.fido_proposto} teorico={r.fido_teorico}
            motivo={r.motivo_extra} onMotivo={(v) => aggiornaMotivoExtra(r.cliente_id, v)} />
        )}
        {!r.proponibile && <p className="break-words">{renderRegola(r)}</p>}
        <DettagliRiga frase={frase}>{dettagli}</DettagliRiga>
      </div>
    );
  };
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
    const teo = teoricoMap?.get(r.cliente_id);
    const ordini = Number(teo?.ordini_aperti ?? 0);
    const spieg = teo?.spiegazione || r.nota_proposta;
    if (!spieg && !cambio && !mot && !prot && ordini <= 0 && Number(teo?.scaduto_oltre ?? 0) <= 0) return null;
    return (
      <div className={`grid grid-cols-1 gap-2 text-xs ${cambio ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        {r.proponibile && <p className="min-w-0 break-words text-muted-foreground">Regola: {renderRegola(r)}</p>}
        {spieg && <p className="min-w-0 break-words text-muted-foreground">{spieg}</p>}
        {prot && (
          <p className={`min-w-0 break-words text-xs sm:text-[11px] ${notaExtraProtetto(prot).decaduta ? "font-medium text-destructive" : "text-success"}`}>
            {notaExtraProtetto(prot).testo}
          </p>
        )}
        {Number(teo?.scaduto_oltre ?? 0) > 0 && (
          <p className="min-w-0 break-words text-muted-foreground">
            Scaduto non pagato: {fmtEuro(Number(teo?.scaduto_oltre))}{teo?.scaduto_oltre_giorni != null ? ` da ${Math.round(Number(teo.scaduto_oltre_giorni)).toLocaleString("it-IT")} giorni` : ""}
          </p>
        )}
        {ordini > 0 && (
          <p className="min-w-0 break-words text-muted-foreground">
            Ordini clienti aperti (non entrano nel fido): {fmtEuro(ordini)}
          </p>
        )}
        {teo && sogliaConsumo && daValutareProposta(r)
          && (teo.segnalazioni.includes("oltre_normale") || teo.segnalazioni.includes("impegni_sopra_base") || teo.segnalazioni.includes("uso_pieno")) && (
          <p className="min-w-0 break-words text-xs sm:text-[11px] text-muted-foreground">
            Per tornare sotto il {Math.round(sogliaConsumo * 100).toLocaleString("it-IT")}% servirebbero{" "}
            <span className="font-medium tabular-nums text-foreground">{fmtEuro(fidoPerTornareSottoSoglia(teo.esposizione_corrente, sogliaConsumo))}</span>
          </p>
        )}
        {mot && (
          <p className="min-w-0 break-words text-xs sm:text-[11px] text-muted-foreground">
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

  /** Scheda verticale per il telefono: stessi pezzi e handler della tabella. */
  const renderSchedaTelefono = (r: RigaProposta) => {
    const scost = r.proponibile ? r.fido_proposto - r.fido_attuale : 0;
    const teo = teoricoMap?.get(r.cliente_id);
    const esposizione = teo?.esposizione_corrente ?? r.esposizione;
    const ordini = Number(teo?.ordini_aperti ?? 0);
    const { frase, perCoprire } = motivoRigaProposta({ regola: r.regola, segnalazioni: r.segnalazioni,
      dati: r.proponibile && teo ? { ...teo, fidoAttuale: r.fido_attuale, consigliato: r.fido_iniziale } : undefined });
    const valore = (etichetta: string, v: ReactNode, attenuato = false) => (
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{etichetta}</div>
        <div className={`break-words text-sm font-medium tabular-nums ${attenuato ? "text-muted-foreground" : ""}`}>{v}</div>
      </div>
    );
    return (
      <div key={r.cliente_id} data-scheda-telefono
        className={`min-w-0 space-y-3 rounded-md border border-l-4 bg-card p-3 text-xs ${!r.proponibile ? "opacity-60" : ""} ${classiRiga(r)}`}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
          <div className="grid size-10 place-items-center">
            <Checkbox checked={r.incluso && r.proponibile} disabled={!r.proponibile}
              onCheckedChange={() => { if (r.proponibile) toggleIncluso(r.cliente_id); }} aria-label={`Includi ${r.ragione_sociale}`} />
          </div>
          <div className="min-w-0 pt-1">
            <div className="flex min-w-0 items-start gap-2">
              <SemaforoPallino cliente={{ fido_teorico_cliente: teo }} className="mt-1 shrink-0" />
              <span className="min-w-0 break-words text-sm font-medium">{r.ragione_sociale}</span>
            </div>
            {r.negozio && <div className="break-words text-xs text-muted-foreground">{r.negozio}</div>}
          </div>
          <div className="flex shrink-0 items-center">{renderMotivazione(r)}{renderRimuovi(r)}</div>
        </div>
        {r.proponibile && (
          <div className="flex min-w-0 flex-wrap gap-1"><BadgeMotiviRiga regola={r.regola} segnalazioni={r.segnalazioni} /></div>
        )}
        {r.richiestaInCorso && (
          <div className={`break-words rounded px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.richiestaInCorso.stato as StatoRichiesta] ?? "bg-muted text-muted-foreground"}`}>
            Richiesta già in corso: {STATO_LABEL[r.richiestaInCorso.stato as StatoRichiesta] ?? r.richiestaInCorso.stato}
            {" · "}{TIPO_LABEL[r.richiestaInCorso.tipo as TipoRichiesta] ?? r.richiestaInCorso.tipo} {fmtEuro(r.richiestaInCorso.importo)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {valore("Fido attuale", fmtEuro(r.fido_attuale))}
          {valore("Ci deve", <>{fmtEuro(esposizione)}{ordini > 0 && <span className="block text-xs font-normal text-motivo-ordini">+ ordini {fmtEuro(ordini)}</span>}</>)}
          {valore("Per coprire", perCoprire == null ? "—" : fmtEuro(perCoprire), perCoprire === r.fido_teorico)}
          {valore("Consigliato", r.proponibile && r.fido_teorico != null ? fmtEuro(r.fido_teorico) : "—")}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          {renderCasella(r, "h-11 w-full text-right text-base")}
          <span className={`whitespace-nowrap text-sm tabular-nums ${scost > 0 ? "text-success" : scost < 0 ? "text-warning" : "text-muted-foreground"}`}>
            {r.proponibile ? `${scost > 0 ? "+" : scost < 0 ? "−" : ""}${fmtEuro(Math.abs(scost))}` : "—"}
          </span>
        </div>
        {r.proponibile && Number(r.fido_proposto) !== Number(r.fido_iniziale) && (
          <Badge variant="outline" className="border-info/40 bg-info/10 text-xs text-info">Modificato</Badge>
        )}
        <SezioneCervedCompatta dati={cervedCompatto?.[r.cliente_id]} fidoAttuale={r.fido_attuale} clienteId={r.cliente_id} className="w-fit max-w-full" />
        {r.proponibile && (
          <CampoExtraTeorico compatto importo={r.fido_proposto} teorico={r.fido_teorico}
            motivo={r.motivo_extra} onMotivo={(v) => aggiornaMotivoExtra(r.cliente_id, v)} />
        )}
        {!r.proponibile && <p className="break-words">{renderRegola(r)}</p>}
        <div className="min-w-0 space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">Condizione di pagamento</Label>
          {renderCondizione(r)}
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">Tipo</Label>
          {renderTipo(r, "h-11 w-full")}
        </div>
        <DettagliRiga frase={frase}>{renderDettagli(r)}</DettagliRiga>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen max-w-none rounded-none border-0 h-dvh max-h-dvh sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[96vw] sm:border sm:rounded-lg max-w-[1600px] sm:max-w-[1600px] sm:h-[90dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col gap-0 p-0 [&>button:last-child]:top-1 [&>button:last-child]:right-1 [&>button:last-child]:size-10 [&>button:last-child]:grid [&>button:last-child]:place-items-center sm:[&>button:last-child]:top-2 sm:[&>button:last-child]:right-2">
        <div className="shrink-0 min-w-0 border-b px-3 py-2 sm:px-4 sm:py-2">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words text-sm leading-5 sm:text-lg">Proposta fido massiva — {righeVisibiliIncluse.length} clienti</DialogTitle>
          <DialogDescription className="sr-only sm:not-sr-only">
            L'importo proposto è il fido teorico calcolato dal sistema (fatturato + condizione di pagamento).
          </DialogDescription>
        </DialogHeader>
        </div>
        <div data-proposte-scroll className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y sm:contents">
        <div className="shrink-0 min-w-0 border-b px-3 py-2 sm:px-4">
        {(teoricoLoading || teoricoRichLoading) && (
          <p className="text-sm text-muted-foreground">Calcolo del fido teorico in corso…</p>
        )}
        {teoricoError && (
          <p className="text-sm text-destructive">
            Impossibile calcolare il fido teorico: {(teoricoError as any)?.message ?? "errore"}
          </p>
        )}
        <Collapsible open={dettagliAperti} onOpenChange={setDettagliAperti}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-10 w-full justify-between px-0 text-xs sm:hidden">
              <span><span aria-hidden className={`inline-block transition-transform ${dettagliAperti ? "rotate-90" : ""}`}>▸</span> Impostazioni e riepilogo</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
        <fieldset className="min-w-0 py-2">
          <legend className="text-sm font-medium">Cosa vuoi mandare?</legend>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-x-2 sm:gap-x-3">
            {([ ["aumento", "Aumenti"], ["diminuzione", "Riduzioni (anche a zero)"], ["nuovo_fido", "Nuovi fidi"], ["rinnovo_da_guardare", "Fido invariato da guardare"], ["rinnovo", "Altri fidi invariati"] ] as [CategoriaProposta, string][]).map(([tipo, nome]) => (
              <div key={tipo} className={`min-w-0 ${tipo === "rinnovo_da_guardare" ? "col-span-2 xl:col-span-1" : ""}`}>
              <label className="flex min-h-10 min-w-0 items-center gap-2 text-xs">
                <Checkbox checked={filtroTipi.includes(tipo)} onCheckedChange={() => toggleTipo(tipo)} aria-label={nome} />
                <span className="break-words">{nome} ({tipoCount(tipo)})</span>
              </label>
              {tipo === "rinnovo_da_guardare" && riepilogoVis.daDecidere > 0 && (
                <p className="pl-6 text-xs sm:text-[11px] leading-4 text-muted-foreground break-words">
                  {Object.entries(riepilogoVis.daDeciderePerMotivo).filter(([, n]) => n > 0)
                    .map(([motivo, n]) => `${fmtN(n)} ${testoMotivoDaGuardare(motivo, n)}`).join(" · ")}
                </p>
              )}
              </div>
            ))}
          </div>
        </fieldset>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1 break-words">
          <p className="text-foreground">Stai vedendo <strong>{fmtN(riepilogoVis.visibili)}</strong> proposte su <strong>{fmtN(riepilogoVis.totale)}</strong> clienti selezionati.</p>
          {nDaControllare > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-warning"><strong>{fmtN(nDaControllare)}</strong> righe da controllare</span>
              <label className="flex min-h-10 items-center gap-2 text-foreground">
                <Switch checked={soloControllo} onCheckedChange={setSoloControllo} aria-label="Mostra solo da controllare" />
                Mostra solo da controllare
              </label>
            </div>
          )}
          {(riepilogoVis.nascosti.rinnovo > 0 || vociNascoste.length > 0 || riepilogoVis.nonProponibiliTotale > 0) && (
            <details className="group">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 font-medium text-foreground">
                <span aria-hidden className="transition-transform group-open:rotate-90">▸</span> Cosa non vedi e perché
              </summary>
              <ul className="ml-4 list-disc">
                {riepilogoVis.nascosti.rinnovo > 0 && (
                  <li>
                    Non vedi {fmtN(riepilogoVis.nascosti.rinnovo)} altri clienti con fido invariato e niente da guardare: non serve mandarli.
                  </li>
                )}
                {vociNascoste.map((testo) => <li key={testo}>{testo}</li>)}
                {riepilogoVis.nonProponibiliTotale > 0 && <li>{fmtN(riepilogoVis.nonProponibiliTotale)} clienti non si possono proporre: {vociNonProponibili.join(" · ")}</li>}
              </ul>
            </details>
          )}
        </div>

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
          </CollapsibleContent>
        </Collapsible>
        </div>
        <div data-proposte-elenco className="min-w-0 px-3 py-2 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overflow-x-hidden sm:px-4 sm:py-2">
        {/* Legenda: colore della riga = motivo principale (fonte unica: motivoRigaProposta). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-xs sm:text-[11px] text-muted-foreground" data-legenda-motivi>
          {LEGENDA_MOTIVI.map(({ motivo, nome }) => (
            <span key={motivo} className="flex items-center gap-1.5">
              <span aria-hidden className={`inline-block size-3 rounded-sm ${CLASSI_MOTIVO_RIGA[motivo].pallino}`} />
              {nome}
            </span>
          ))}
        </div>
        {/* Schede anche su tablet: la tabella estesa richiede spazio desktop. */}
        <div className="hidden sm:block xl:hidden [&>div]:block [&>div>div>div:first-child]:grid [&>div>div>div:first-child]:grid-cols-1 [&>div>div>div:first-child>div:last-child]:justify-end">
        <ElencoSchede>
          {righeVisibili.map((r) => (
              <SchedaLista
                key={r.cliente_id}
                className={`${!r.proponibile ? "opacity-60" : ""} ${classiRiga(r)}`}
                selezione={{ checked: r.incluso && r.proponibile, onChange: () => { if (r.proponibile) toggleIncluso(r.cliente_id); } }}
                titolo={renderCliente(r)}
                badge={
                  <div className="flex shrink-0 items-center">
                    {renderMotivazione(r)}
                    {renderRimuovi(r)}
                  </div>
                }
                campi={[]}
                footer={
                  <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2">{renderCorpo(r, "h-10 w-32 text-right")}</div>
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">Tipo</Label>
                      {renderTipo(r, "h-10 w-full")}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label className="text-xs text-muted-foreground font-normal">Cond. pagamento</Label>
                      {renderCondizione(r)}
                    </div>
                  </div>
                }
              />
          ))}
        </ElencoSchede>
        </div>

        {/* Telefono (sotto 640px): scheda verticale. */}
        <div className="space-y-2 sm:hidden" data-schede-telefono>
          {righeVisibili.map((r) => renderSchedaTelefono(r))}
        </div>

        <div className="hidden xl:block min-w-0 [&>div]:overflow-x-visible">
          <Table className="table-fixed w-full text-xs [&_th]:px-1 [&_td]:px-1 [&_th]:whitespace-nowrap [&_td]:whitespace-normal [&_td]:align-top">
            <colgroup>
              <col className="w-8" /><col />
              <col className="w-44" /><col className="w-32" /><col className="w-14" /><col className="w-10" />
            </colgroup>
            <TableHeader><TableRow>
              <TableHead /><TableHead>Cliente e proposta</TableHead>
              <TableHead>Condizione di pagamento</TableHead>
              <TableHead>Tipo</TableHead><TableHead>Motivo</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {righeVisibili.map((r) => (
                    <TableRow key={r.cliente_id} className={`${!r.proponibile ? "opacity-60" : ""} border-b-2 border-border ${classiRiga(r)}`}>
                      <TableCell className={classiRiga(r)}><Checkbox checked={r.incluso && r.proponibile} disabled={!r.proponibile} onCheckedChange={() => toggleIncluso(r.cliente_id)} aria-label={`Includi ${r.ragione_sociale}`} /></TableCell>
                      <TableCell className="min-w-0">
                        <div className="font-medium">{renderCliente(r)}</div>
                        <div className="mt-1">{renderCorpo(r, "h-10 w-32 px-1 text-xs text-right")}</div>
                      </TableCell>
                      <TableCell>{renderCondizione(r)}</TableCell>
                      <TableCell>{renderTipo(r, "h-10 w-full min-w-0 px-1 text-xs")}</TableCell>
                      <TableCell><div className="[&_button]:w-8 [&_button]:h-10">{renderMotivazione(r)}</div></TableCell>
                      <TableCell><div className="[&_button]:w-8 [&_button]:h-10">{renderRimuovi(r)}</div></TableCell>
                    </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>

        </div>
        <div className="shrink-0 min-w-0 border-t bg-background px-3 py-2 sm:px-4 sm:py-2 grid grid-cols-1 gap-1 sm:gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <p className="truncate text-xs font-medium tabular-nums sm:hidden">
            Nuovo fido {fmtEuro(riepilogo.totaleProposto)} ({riepilogo.differenza > 0 ? "+" : riepilogo.differenza < 0 ? "−" : "±"}{fmtEuro(Math.abs(riepilogo.differenza))}) · {righeVisibiliIncluse.length} richieste
          </p>
          <div className="hidden sm:block min-w-0 space-y-0.5">
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
          <div className="hidden sm:block text-xs text-info lg:col-start-1">
            {righeVisibiliIncluse.filter((r) => condizionePagamentoCambiata(r.cond_proposta, r.cond_attuale)).length > 0 &&
              <>{righeVisibiliIncluse.filter((r) => condizionePagamentoCambiata(r.cond_proposta, r.cond_attuale)).length} con cambio di condizione di pagamento</>}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-1 sm:gap-2 sm:flex sm:items-center lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="col-span-2 min-w-0">
              <Label className="sr-only sm:not-sr-only sm:text-xs">Modalità invio</Label>
              <div className="grid grid-cols-2 gap-0.5 rounded-md border p-0.5" role="group" aria-label="Modalità invio">
                <Button type="button" size="sm" variant={modalitaInvio === "bozza" ? "secondary" : "ghost"} aria-pressed={modalitaInvio === "bozza"} className="h-10 px-2 text-xs" onClick={() => setModalitaInvio("bozza")}>Salva come bozza</Button>
                <Button type="button" size="sm" variant={modalitaInvio === "invia" ? "secondary" : "ghost"} aria-pressed={modalitaInvio === "invia"} className="h-10 px-2 text-xs" onClick={() => setModalitaInvio("invia")}>Invia subito<span className="sr-only"> all'approvazione</span></Button>
              </div>
            </div>
            <Button variant="outline" className="hidden sm:inline-flex sm:w-auto" onClick={() => onOpenChange(false)} disabled={submitting}>Annulla</Button>
            <Button className="col-span-2 h-10 w-full sm:w-auto" onClick={creaRichieste} disabled={submitting || ricalcoloInCorso || righeVisibiliIncluse.length === 0}>
              {ricalcoloInCorso && !submitting ? "Attendi la fine del ricalcolo" : submitting ? (avanzamentoCrea ? `Creazione: ${avanzamentoCrea.fatte.toLocaleString("it-IT")} di ${avanzamentoCrea.totali.toLocaleString("it-IT")}…` : "Creazione…") : `Crea ${righeVisibiliIncluse.length} richieste`}
            </Button>
          </DialogFooter>
        </div>


      </DialogContent>
    </Dialog>
  );
}
