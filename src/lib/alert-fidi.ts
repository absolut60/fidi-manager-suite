// FM55 — Alert fidi: lettura (fonte unica lato client), etichette e regole di presentazione.
// I dati sono calcolati da public.aggiorna_alert_fidi(); la visibilità segue quella dei clienti (RLS).
import { supabase } from "@/integrations/supabase/client";
import { leggiTutteLeRighe } from "@/lib/leggi-tutte-le-righe";
import { FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";

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
};

export const TIPO_ALERT_LABEL: Record<TipoAlertFido, string> = {
  consumo: "Consumo",
  riduzione: "Riduzione",
  extra_non_usato: "Extra non usato",
};

export const STATO_ALERT_LABEL: Record<StatoAlertFido, string> = {
  aperto: "Aperto",
  richiesta_inserita: "Richiesta inserita",
  in_osservazione: "In osservazione",
  confermato: "Confermato",
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
export function alertSelezionabile(a: Pick<AlertFidoRow, "stato">): boolean {
  return a.stato !== "in_osservazione";
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
  const select = `id, cliente_id, tipo, livello, stato, aperto_il, fido_gamma, esposizione, ordini_aperti, consumo, fido_proposto, richiesta_id, riproponi_dal,
    cliente:clienti!alert_fidi_cliente_id_fkey(id, codice_gestionale, ragione_sociale, store_id, codice_agente, totale_rischio, ${FIDO_CLIENTE_SELECT}, stores(nome)),
    richiesta:richieste_fido!alert_fidi_richiesta_id_fkey(id, fido_teorico_riferimento)`;
  return leggiTutteLeRighe<AlertFidoRow>((da, a) =>
    (supabase as any)
      .from("alert_fidi")
      .select(select)
      .neq("stato", "chiuso")
      .order("aperto_il", { ascending: false })
      .order("id")
      .range(da, a),
  );
}

export async function confermaExtraAlertFido(alertId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("conferma_extra_alert_fido", { _alert_id: alertId });
  if (error) throw error;
}
