// FM55 — Alert fidi: lettura (fonte unica lato client), etichette e regole di presentazione.
// I dati sono calcolati da public.aggiorna_alert_fidi(); la visibilità segue quella dei clienti (RLS).
import { supabase } from "@/integrations/supabase/client";
import { leggiTutteLeRighe } from "@/lib/leggi-tutte-le-righe";
import { FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";
import { fetchExtraFidoProtetti, protezioneAttiva } from "@/lib/fido-teorico";
import { isRichiestaAttiva, STATO_LABEL, formatEuro, type StatoRichiesta } from "@/lib/fidi";

export type TipoAlertFido = "consumo" | "riduzione" | "extra_non_usato";
export type StatoAlertFido = "in_osservazione" | "aperto" | "richiesta_inserita" | "confermato";

export type AlertFidoRow = {
  id: string;
  cliente_id: string;
  tipo: TipoAlertFido;
  livello: number | null;
  stato: StatoAlertFido;
  aperto_il: string;
  fido_gamma: number | null;
  esposizione: number | null;
  ordini_aperti: number | null;
  consumo: number | null;
  fido_proposto: number | null;
  fido_gamma_apertura?: number | null;
  richiesta_id: string | null;
  riproponi_dal: string | null;
  cliente: {
    id: string;
    codice_gestionale: string | null;
    ragione_sociale: string;
    store_id: string | null;
    codice_agente: string | null;
    totale_rischio: number | null;
    fido_gestionale: number | null;
    stores: { nome: string } | null;
  } | null;
  richiesta: { id: string; fido_teorico_riferimento: number | null } | null;
  /** Ultima richiesta attiva del cliente, letta dal vivo (null se nessuna). */
  richiesta_attiva?: RichiestaClienteAlert | null;
  /** Richiesta processata dopo l'apertura senza cambio del fido in Gamma (es. rinnovo): alert resta visibile. */
  decisione?: RichiestaClienteAlert | null;
  /** Decisione con extra ancora protetto (extra_fido_protetti): non selezionabile. */
  decisione_protetta?: boolean;
};

export type RichiestaClienteAlert = {
  id: string;
  cliente_id: string;
  stato: string;
  stato_export: string | null;
  tipo: string | null;
  importo_richiesto: number | null;
  created_at: string;
  data_processata: string | null;
};

export type EsitoRichiestaAlert =
  | { tipo: "attiva"; richiesta: RichiestaClienteAlert }
  | { tipo: "processata" }
  | { tipo: "decisa"; richiesta: RichiestaClienteAlert }
  | { tipo: "nessuna" };

/**
 * Stato della richiesta di un alert, dal vivo (regola di Andrea, FM55):
 * - richiesta attiva del cliente (isRichiestaAttiva), qualunque data → "attiva" (ultima per data);
 * - altrimenti, richiesta processata dopo l'apertura dell'alert: se il fido in Gamma attuale è diverso
 *   da fido_gamma_apertura → "processata" (riga nascosta); se è rimasto uguale (es. rinnovo) → "decisa"
 *   (riga visibile con la decisione presa);
 * - altrimenti (nessuna, rifiutata, annullata) → "nessuna": l'alert torna aperto.
 * Per gli extra non usati la richiesta approvata che ha generato l'alert non conta.
 */
export function esitoRichiestaAlert(
  a: Pick<AlertFidoRow, "tipo" | "aperto_il" | "richiesta_id"> & { fido_gamma_apertura?: number | null },
  richieste: RichiestaClienteAlert[],
  fidoGammaAttuale?: number | null,
): EsitoRichiestaAlert {
  const proprie = richieste.filter((r) => !(a.tipo === "extra_non_usato" && r.id === a.richiesta_id));
  const attive = proprie.filter((r) => isRichiestaAttiva(r)).sort((x, y) => y.created_at.localeCompare(x.created_at));
  if (attive.length > 0) return { tipo: "attiva", richiesta: attive[0] };
  const apertura = new Date(a.aperto_il).getTime();
  const processate = proprie.filter((r) => r.stato === "approvata" && r.stato_export === "processata"
    && new Date(r.data_processata ?? r.created_at).getTime() > apertura)
    .sort((x, y) => (y.data_processata ?? y.created_at).localeCompare(x.data_processata ?? x.created_at));
  if (processate.length === 0) return { tipo: "nessuna" };
  const fidoUguale = a.fido_gamma_apertura != null && fidoGammaAttuale != null
    && Number(a.fido_gamma_apertura) === Number(fidoGammaAttuale);
  return fidoUguale ? { tipo: "decisa", richiesta: processate[0] } : { tipo: "processata" };
}

/** Stato mostrato: con richiesta attiva "richiesta_inserita"; senza, un richiesta_inserita torna "aperto". */
export function statoEffettivoAlert(a: Pick<AlertFidoRow, "stato" | "richiesta_attiva">): StatoAlertFido {
  if (a.richiesta_attiva) return "richiesta_inserita";
  return a.stato === "richiesta_inserita" ? "aperto" : a.stato;
}

/** Badge della decisione già processata senza cambio di fido, es. "Decisione presa il 31/10: rinnovo a 3.000 €". */
export function etichettaDecisioneAlert(r: RichiestaClienteAlert): string {
  const giorno = new Date(r.data_processata ?? r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  const tipo = r.tipo === "rinnovo" ? "rinnovo" : r.tipo === "diminuzione" ? "diminuzione" : r.tipo === "aumento" ? "aumento" : r.tipo === "nuovo_fido" ? "nuovo fido" : (r.tipo ?? "decisione");
  const imp = r.importo_richiesto != null ? ` a ${formatEuro(Number(r.importo_richiesto))}` : "";
  return `Decisione presa il ${giorno}: ${tipo}${imp}`;
}

/** Testo del badge, es. "Proposta inoltrata · In approvazione · 20.000 € · del 31/10". */
export function etichettaRichiestaAlert(r: RichiestaClienteAlert): string {
  const giorno = new Date(r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  const imp = r.importo_richiesto != null ? ` · ${formatEuro(Number(r.importo_richiesto))}` : "";
  if (r.stato === "approvata") return `Approvata, da inserire in Gamma${imp} · del ${giorno}`;
  const st = STATO_LABEL[r.stato as StatoRichiesta] ?? r.stato;
  return `Proposta inoltrata · ${st}${imp} · del ${giorno}`;
}

export const TIPO_ALERT_LABEL: Record<TipoAlertFido, string> = {
  consumo: "Consumo",
  riduzione: "Riduzione",
  extra_non_usato: "Extra non usato",
};

export const STATO_ALERT_LABEL: Record<StatoAlertFido, string> = {
  aperto: "Aperto",
  richiesta_inserita: "Richiesta inserita",
  in_osservazione: "In osservazione",
  confermato: "Lasciato così",
};

export const STATI_ALERT_DEFAULT: StatoAlertFido[] = ["aperto", "richiesta_inserita"];

/** Testo dell'avviso, es. "Consumo 90%". */
export function etichettaAvviso(a: Pick<AlertFidoRow, "tipo" | "livello">): string {
  if (a.tipo === "consumo") {
    const p = a.livello != null ? Math.round(Number(a.livello) * 100) : null;
    return p != null ? `Consumo ${p}%` : "Consumo";
  }
  return TIPO_ALERT_LABEL[a.tipo];
}

/** Debito di oggi = esposizione + ordini aperti. */
export function debitoOggi(a: Pick<AlertFidoRow, "esposizione" | "ordini_aperti">): number {
  return Number(a.esposizione ?? 0) + Number(a.ordini_aperti ?? 0);
}

/** Gli alert in osservazione non si possono usare per creare una proposta. */
export function alertSelezionabile(a: Pick<AlertFidoRow, "stato" | "richiesta_attiva" | "decisione_protetta">): boolean {
  return statoEffettivoAlert(a) !== "in_osservazione" && !a.richiesta_attiva && !a.decisione_protetta;
}

/**
 * Importo da passare alla proposta massiva (teorico di riferimento e importo iniziale):
 * riduzione → fido proposto dell'alert; extra non usato → teorico di riferimento della
 * richiesta collegata; consumo → nessuno (vale il teorico normale).
 */
export function importoDaAlert(a: AlertFidoRow): number | undefined {
  if (a.tipo === "riduzione" && a.fido_proposto != null) return Number(a.fido_proposto);
  if (a.tipo === "extra_non_usato" && a.richiesta?.fido_teorico_riferimento != null)
    return Number(a.richiesta.fido_teorico_riferimento);
  return undefined;
}

export async function fetchAlertFidiAperti(): Promise<AlertFidoRow[]> {
  const select = `id, cliente_id, tipo, livello, stato, aperto_il, fido_gamma, esposizione, ordini_aperti, consumo, fido_proposto, fido_gamma_apertura, richiesta_id, riproponi_dal,
    cliente:clienti!alert_fidi_cliente_id_fkey(id, codice_gestionale, ragione_sociale, store_id, codice_agente, totale_rischio, ${FIDO_CLIENTE_SELECT}, stores(nome)),
    richiesta:richieste_fido!alert_fidi_richiesta_id_fkey(id, fido_teorico_riferimento)`;
  const alert = await leggiTutteLeRighe<AlertFidoRow>((da, a) =>
    (supabase as any)
      .from("alert_fidi")
      .select(select)
      .neq("stato", "chiuso")
      .order("aperto_il", { ascending: false })
      .order("id")
      .range(da, a),
  );
  const perCliente = await fetchRichiesteClientiAlert(alert.map((a) => a.cliente_id));
  const out: AlertFidoRow[] = [];
  for (const a of alert) {
    const fidoAttuale = a.cliente?.fido_gestionale != null ? Number(a.cliente.fido_gestionale) : null;
    const esito = esitoRichiestaAlert(a, perCliente.get(a.cliente_id) ?? [], fidoAttuale);
    if (esito.tipo === "processata") continue;
    out.push({ ...a, richiesta_attiva: esito.tipo === "attiva" ? esito.richiesta : null,
      decisione: esito.tipo === "decisa" ? esito.richiesta : null });
  }
  const conDecisione = out.filter((a) => a.decisione).map((a) => a.cliente_id);
  if (conDecisione.length > 0) {
    const protetti = await fetchExtraFidoProtetti([...new Set(conDecisione)]);
    for (const a of out) if (a.decisione) a.decisione_protetta = protezioneAttiva(protetti.get(a.cliente_id));
  }
  return out;
}

async function fetchRichiesteClientiAlert(ids: string[]): Promise<Map<string, RichiestaClienteAlert[]>> {
  const map = new Map<string, RichiestaClienteAlert[]>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 500) {
    const { data, error } = await supabase
      .from("richieste_fido")
      .select("id, cliente_id, stato, stato_export, tipo, importo_richiesto, created_at, data_processata")
      .in("cliente_id", uniq.slice(i, i + 500));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!r.cliente_id) continue;
      const l = map.get(r.cliente_id) ?? [];
      l.push(r as RichiestaClienteAlert);
      map.set(r.cliente_id, l);
    }
  }
  return map;
}

export async function confermaExtraAlertFido(alertId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("conferma_extra_alert_fido", { _alert_id: alertId });
  if (error) throw error;
}

/** "Lascia così" per 30 giorni (consumo ed extra non usato aperti): public.conferma_alert_fido. */
export async function confermaAlertFido(alertId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("conferma_alert_fido", { _alert_id: alertId });
  if (error) throw error;
}

/** Tipi di alert che si possono "lasciare così" (gemello di public.conferma_alert_fido). */
export function alertLasciabileCosi(a: Pick<AlertFidoRow, "tipo" | "stato" | "richiesta_attiva">): boolean {
  return (a.tipo === "consumo" || a.tipo === "extra_non_usato") && statoEffettivoAlert(a) === "aperto";
}

const CODICI_COMPRA_OLTRE = ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"];

/**
 * Frase "Cosa fare" della pagina Alert fidi. Nessun calcolo: legge solo le segnalazioni
 * (fido_teorico_cliente.segnalazioni), lo scaduto oltre soglia e il riferimento della richiesta
 * (fetchFidoTeoricoPerRichiesta). Ordine di priorità fissato da Andrea (FM55).
 */
export function cosaFareAlert(
  a: Pick<AlertFidoRow, "fido_gamma">,
  riferimento: number | null | undefined,
  teorico: { segnalazioni: string[]; scaduto_oltre?: number | null } | null | undefined,
): string {
  const cod = teorico?.segnalazioni ?? [];
  if (cod.includes("scaduto_non_incassato") || cod.includes("scaduto_da_incassare"))
    return `Prima incassare: ${formatEuro(Number(teorico?.scaduto_oltre ?? 0))} scaduti`;
  if (cod.includes("bloccato")) return "Cliente bloccato: nessun aumento";
  if (cod.some((c) => CODICI_COMPRA_OLTRE.includes(c))) return "Compra oltre il normale: il sistema non aumenta, decidi tu";
  if (riferimento != null && Number(riferimento) > Number(a.fido_gamma ?? 0)) return `Aumento proposto a ${formatEuro(Number(riferimento))}`;
  return "Nessuna variazione proposta: valuta tu";
}

/** Etichette del filtro "Situazione" (stessi valori di stato, testi per lo store manager). */
export const SITUAZIONE_ALERT_LABEL: Record<StatoAlertFido, string> = {
  aperto: "Da gestire",
  richiesta_inserita: "Proposta inviata",
  confermato: "Lasciati così",
  in_osservazione: "In osservazione",
};

/** Testo breve della colonna "Richiesta" per una richiesta attiva. */
export function etichettaRichiestaBreve(r: Pick<RichiestaClienteAlert, "stato">): string {
  return r.stato === "approvata" ? "Approvata – da inserire in Gamma" : "Proposta inviata – in approvazione";
}

/**
 * Frase "Perché" dell'alert, solo dai valori già calcolati (nessun calcolo nuovo):
 * scaduto oltre soglia prevale; altrimenti secondo il tipo dell'alert.
 */
export function percheAlert(
  a: Pick<AlertFidoRow, "tipo" | "fido_gamma" | "esposizione" | "ordini_aperti" | "consumo" | "fido_proposto">,
  teorico?: { segnalazioni: readonly string[]; scaduto_oltre?: number | null; scaduto_oltre_giorni?: number | null } | null,
): string {
  const cod = teorico?.segnalazioni ?? [];
  const scaduto = Number(teorico?.scaduto_oltre ?? 0);
  if ((cod.includes("scaduto_non_incassato") || cod.includes("scaduto_da_incassare")) && scaduto > 0) {
    const gg = Number(teorico?.scaduto_oltre_giorni ?? 0);
    return gg > 0 ? `Scaduto non pagato da oltre ${gg} giorni: ${formatEuro(scaduto)}` : `Scaduto non pagato: ${formatEuro(scaduto)}`;
  }
  const debito = debitoOggi(a);
  const fido = Number(a.fido_gamma ?? 0);
  if (a.tipo === "consumo") {
    const p = a.consumo != null ? Math.round(Number(a.consumo) * 100) : (fido > 0 ? Math.round((debito / fido) * 100) : null);
    return p != null
      ? `Ha usato il ${p}% del fido: ${formatEuro(debito)} su ${formatEuro(fido)}`.replace(/^Ha usato il (8|11)/, "Ha usato l'$1")
      : `Ha usato ${formatEuro(debito)} su ${formatEuro(fido)}`;
  }
  if (a.tipo === "riduzione") {
    const prop = a.fido_proposto != null ? ` (ne basterebbero ${formatEuro(Number(a.fido_proposto))})` : "";
    return `Usa poco il fido: ${formatEuro(debito)} su ${formatEuro(fido)}${prop}`;
  }
  return `Extra approvato non usato: usa ${formatEuro(debito)} su ${formatEuro(fido)}`;
}
