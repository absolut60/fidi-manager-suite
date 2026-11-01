// FM55 — Alert fidi: lettura (fonte unica lato client), etichette e regole di presentazione.
// I dati sono calcolati da public.aggiorna_alert_fidi(); la visibilità segue quella dei clienti (RLS).
import { supabase } from "@/integrations/supabase/client";
import { leggiTutteLeRighe } from "@/lib/leggi-tutte-le-righe";
import { FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";
import { fetchExtraFidoProtetti, protezioneAttiva, isPrivatoFido, type ExtraFidoProtetto } from "@/lib/fido-teorico";
import { isRichiestaAttiva, STATO_LABEL, formatEuro, type StatoRichiesta } from "@/lib/fidi";

export type TipoAlertFido = "consumo" | "riduzione" | "extra_non_usato";
export type StatoAlertFido = "in_osservazione" | "aperto" | "richiesta_inserita" | "confermato" | "gia_deciso";

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
    partita_iva?: string | null;
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
  /** Decisione approvata ancora protetta con riferimento = fido Gamma (giaDeciso): fuori dalla lista di lavoro. */
  gia_deciso?: DecisioneProtetta | null;
};

/** Decisione approvata protetta (public.extra_fido_protetti) con tipo e nome di chi ha approvato. */
export type DecisioneProtetta = ExtraFidoProtetto & { tipo: string | null; approvato_da_nome: string | null };

/**
 * Fonte unica "Già deciso" (FM55): decisione approvata ancora protetta (protezioneAttiva)
 * e riferimento della richiesta uguale al fido in Gamma. Usata da Alert fidi e Revisione fidi.
 */
export function giaDeciso(
  protetto: ExtraFidoProtetto | null | undefined,
  riferimento: number | null | undefined,
  fidoGamma: number | null | undefined,
): boolean {
  return giaDecisoDa(protezioneAttiva(protetto ?? undefined), riferimento, fidoGamma);
}

/** Stessa regola di giaDeciso, partendo dall'esito di protezioneAttiva. */
export function giaDecisoDa(protezioneValida: boolean, riferimento: number | null | undefined, fidoGamma: number | null | undefined): boolean {
  return protezioneValida && riferimento != null && Number(riferimento) === Number(fidoGamma ?? 0);
}

/**
 * "Già deciso" per gli AVVISI (notifiche ed email Alert fidi), decisione 01/11/2026 opzione 2:
 * protezione attiva (protezione_valida, entro protetto_fino_al) e fido Gamma = importo approvato.
 * Gemello TS di public.alert_fido_gia_deciso(uuid), che lo applica in invia_notifiche_alert_fidi.
 * Non usa il riferimento ricalcolato della pagina: può differire da giaDeciso solo se il riferimento
 * supera l'importo approvato.
 */
export function giaDecisoAvviso(
  protetto: Pick<ExtraFidoProtetto, "protezione_valida" | "protetto_fino_al" | "importo_approvato"> | null | undefined,
  fidoGamma: number | null | undefined,
  oggiIso: string,
): boolean {
  if (!protetto || protetto.protezione_valida !== true) return false;
  if (String(protetto.protetto_fino_al).slice(0, 10) < oggiIso.slice(0, 10)) return false;
  return Number(fidoGamma ?? 0) === Number(protetto.importo_approvato);
}

function giornoMeseIso(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m && d.length === 10) return `${m[3]}/${m[2]}`;
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
}

/** Frase per lo store manager, es. "Già deciso il 31/10 da Mario Rossi: fido confermato a 60.000 € anche con lo scaduto. Si riguarda dal 30/11." */
export function testoGiaDeciso(
  d: Pick<DecisioneProtetta, "approvata_il" | "protetto_fino_al" | "importo_approvato" | "tipo" | "approvato_da_nome" | "scaduto_al_momento" | "scaduto_attuale">,
): string {
  const da = d.approvato_da_nome ? ` da ${d.approvato_da_nome}` : "";
  const imp = `${Math.round(Number(d.importo_approvato)).toLocaleString("it-IT")} €`;
  const azione = d.tipo === "rinnovo" ? `fido confermato a ${imp}` : `portato a ${imp}`;
  const scaduto = d.scaduto_al_momento != null ? Number(d.scaduto_al_momento) : Number(d.scaduto_attuale ?? 0);
  const conScaduto = scaduto > 0 ? " anche con lo scaduto" : "";
  return `Già deciso il ${giornoMeseIso(d.approvata_il)}${da}: ${azione}${conScaduto}. Si riguarda dal ${giornoMeseIso(d.protetto_fino_al)}.`;
}

/** Decisioni protette per cliente (anche decadute: la condizione la applica giaDeciso). */
export async function fetchDecisioniProtette(clienteIds: string[]): Promise<Map<string, DecisioneProtetta>> {
  const protetti = await fetchExtraFidoProtetti(clienteIds);
  const out = new Map<string, DecisioneProtetta>();
  if (protetti.size === 0) return out;
  const ids = [...new Set([...protetti.values()].map((p) => p.richiesta_id))];
  const info = new Map<string, { tipo: string | null; approvato_da: string | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.from("richieste_fido").select("id, tipo, approvato_da").in("id", ids.slice(i, i + 500));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) info.set(r.id, { tipo: r.tipo, approvato_da: r.approvato_da });
  }
  const nomi = new Map<string, string>();
  const { data: profs } = await supabase.rpc("get_nomi_utenti" as never);
  for (const p of ((profs ?? []) as any[])) {
    const n = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
    if (n) nomi.set(p.id, n);
  }
  for (const [cid, p] of protetti) {
    const r = info.get(p.richiesta_id);
    out.set(cid, { ...p, tipo: r?.tipo ?? null, approvato_da_nome: r?.approvato_da ? nomi.get(r.approvato_da) ?? null : null });
  }
  return out;
}

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
export function statoEffettivoAlert(a: Pick<AlertFidoRow, "stato" | "richiesta_attiva"> & { gia_deciso?: unknown }): StatoAlertFido {
  if (a.richiesta_attiva) return "richiesta_inserita";
  if (a.gia_deciso) return "gia_deciso";
  return a.stato === "richiesta_inserita" ? "aperto" : a.stato;
}

/** Per la categoria rinnovi da guardare: conta soltanto il consumo effettivamente aperto. */
export function alertConsumoAperto(a: Pick<AlertFidoRow, "tipo" | "stato" | "richiesta_attiva"> & { gia_deciso?: unknown }): boolean {
  return a.tipo === "consumo" && statoEffettivoAlert(a) === "aperto";
}

/** Riga grigia della decisione già processata senza cambio di fido, es. "Ultima decisione: 01/11, confermato 50.000 €". */
export function etichettaDecisioneAlert(r: RichiestaClienteAlert): string {
  const giorno = new Date(r.data_processata ?? r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
  const tipo = r.tipo === "rinnovo" ? "confermato" : r.tipo === "diminuzione" ? "ridotto a" : r.tipo === "aumento" ? "aumentato a" : r.tipo === "nuovo_fido" ? "nuovo fido" : (r.tipo ?? "decisione");
  const imp = r.importo_richiesto != null ? ` ${formatEuro(Number(r.importo_richiesto))}` : "";
  return `Ultima decisione: ${giorno}, ${tipo}${imp}`;
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
  gia_deciso: "Già decisi",
};

export const STATI_ALERT_DEFAULT: StatoAlertFido[] = ["aperto", "richiesta_inserita"];

/** Testo del badge, es. "Vicino al limite 94%" (debito / fido Gamma, ordini esclusi). */
export function etichettaAvviso(a: Pick<AlertFidoRow, "tipo" | "fido_gamma" | "esposizione">): string {
  if (a.tipo === "consumo") {
    const p = percentualeFido(debitoOggi(a), a.fido_gamma);
    return p != null ? `Vicino al limite ${p}%` : "Vicino al limite";
  }
  return TIPO_ALERT_LABEL[a.tipo];
}

/**
 * Debito di oggi = esposizione (totale rischio Gamma). Gli ordini aperti NON entrano
 * (FM55 fetta 4): gemello di consumo in public.aggiorna_alert_fidi / get_fido_teorico_v2.
 */
export function debitoOggi(a: Pick<AlertFidoRow, "esposizione">): number {
  return Number(a.esposizione ?? 0);
}

/** Gli alert in osservazione non si possono usare per creare una proposta. */
export function alertSelezionabile(a: Pick<AlertFidoRow, "stato" | "richiesta_attiva" | "decisione_protetta" | "gia_deciso">): boolean {
  const st = statoEffettivoAlert(a);
  return st !== "in_osservazione" && st !== "gia_deciso" && !a.richiesta_attiva && !a.decisione_protetta;
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
    cliente:clienti!alert_fidi_cliente_id_fkey(id, codice_gestionale, ragione_sociale, store_id, partita_iva, codice_agente, totale_rischio, ${FIDO_CLIENTE_SELECT}, stores(nome)),
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
    if (!a.cliente || isPrivatoFido(a.cliente)) continue;
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

/** Etichette del filtro "Situazione" (stessi valori di stato, testi per lo store manager). */
export const SITUAZIONE_ALERT_LABEL: Record<StatoAlertFido, string> = {
  aperto: "Da gestire",
  richiesta_inserita: "Proposta inviata",
  confermato: "Lasciati così",
  in_osservazione: "In osservazione",
  gia_deciso: "Già decisi",
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
  a: Pick<AlertFidoRow, "tipo" | "fido_gamma" | "esposizione">,
  teorico?: { segnalazioni: readonly string[]; scaduto_oltre?: number | null; scaduto_oltre_giorni?: number | null } | null,
): string {
  const cod = teorico?.segnalazioni ?? [];
  const scaduto = Number(teorico?.scaduto_oltre ?? 0);
  if ((cod.includes("scaduto_non_incassato") || cod.includes("scaduto_da_incassare")) && scaduto > 0) {
    const gg = Number(teorico?.scaduto_oltre_giorni ?? 0);
    return gg > 0 ? `Scaduto non pagato da oltre ${gg} giorni: ${formatEuro(scaduto)}.` : `Scaduto non pagato: ${formatEuro(scaduto)}.`;
  }
  const oltre = cod.includes("oltre_normale") ? " e sta comprando molto più del solito" : "";
  if (a.tipo === "consumo") {
    const p = percentualeFido(debitoOggi(a), a.fido_gamma);
    const base = p != null ? `Ci deve il ${p}% del fido`.replace(/^Ci deve il (8|11)/, "Ci deve l'$1") : `Ci deve ${formatEuro(debitoOggi(a))}`;
    return `${base}${oltre}.`;
  }
  if (a.tipo === "riduzione") return "Usa poco il fido: ne basta meno.";
  return "Extra approvato e non usato.";
}

function percentualeFido(importo: number, fido: number | null | undefined): number | null {
  const f = Number(fido ?? 0);
  return f > 0 ? Math.round((importo / f) * 100) : null;
}

/** Riga arancione sugli ordini (solo informativa), es. "Ordini in arrivo 15.929 €: consegnati arriva al 91% del fido". */
export function testoOrdiniAlert(a: Pick<AlertFidoRow, "fido_gamma" | "esposizione" | "ordini_aperti">): string | null {
  const ord = Number(a.ordini_aperti ?? 0);
  if (ord <= 0) return null;
  const p = percentualeFido(debitoOggi(a) + ord, a.fido_gamma);
  return `Ordini in arrivo ${formatEuro(ord)}` + (p != null ? `: consegnati arriva al ${p}% del fido` : "");
}

/**
 * "Fido teorico" della scheda Alert: lo stesso valore che la proposta massiva precompila
 * (importo dell'alert se presente, altrimenti riferimento della richiesta; nulla se non proponibile).
 */
export function teoricoPropostaIniziale(proponibile: boolean, daAlert: number | undefined, riferimento: number | null | undefined): number | null {
  if (!proponibile) return null;
  return daAlert !== undefined ? daAlert : (riferimento ?? null);
}

const SENZA = "__none__";

/** Filtro Negozio/Agente (FiltroMultiplo: vuoto = tutti, "__none__" = senza). Usato da Alert fidi e Revisione fidi. */
export function passaNegozioAgente(
  storeId: string | null | undefined, codiceAgente: string | null | undefined,
  negozi: readonly string[], agenti: readonly string[],
): boolean {
  if (negozi.length > 0 && !negozi.includes(storeId ?? SENZA)) return false;
  if (agenti.length > 0 && !agenti.includes(codiceAgente ?? SENZA)) return false;
  return true;
}

export type FiltriAlert = { stati?: readonly string[]; tipi?: readonly string[]; negozi?: readonly string[]; agenti?: readonly string[]; richiesta?: readonly string[] };

/** Filtro della lista Alert fidi (fonte unica per lista e contatori). */
export function filtraAlert<T extends AlertFidoRow>(righe: readonly T[], f: FiltriAlert): T[] {
  const stati = f.stati ?? [], tipi = f.tipi ?? [], richiesta = f.richiesta ?? [];
  return righe.filter((a) => {
    if (stati.length > 0 && !stati.includes(statoEffettivoAlert(a))) return false;
    if (richiesta.length > 0 && !richiesta.includes(a.richiesta_attiva ? "inoltrata" : "senza")) return false;
    if (tipi.length > 0 && !tipi.includes(a.tipo)) return false;
    return passaNegozioAgente(a.cliente?.store_id, a.cliente?.codice_agente, f.negozi ?? [], f.agenti ?? []);
  });
}

/** Contatori "da gestire" per tipo, su righe già filtrate per Negozio/Agente/Richiesta. */
export function contatoriAlert(righe: readonly AlertFidoRow[]) {
  const aperti = righe.filter((a) => statoEffettivoAlert(a) === "aperto");
  return {
    c80: aperti.filter((a) => a.tipo === "consumo" && Number(a.livello) < 0.9).length,
    c90: aperti.filter((a) => a.tipo === "consumo" && Number(a.livello) >= 0.9).length,
    rid: aperti.filter((a) => a.tipo === "riduzione").length,
    extra: aperti.filter((a) => a.tipo === "extra_non_usato").length,
  };
}
