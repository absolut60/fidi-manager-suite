/**
 * Azioni multiple su richieste_fido — FONTE UNICA (FM50).
 *
 * Ogni riga di richieste_fido fa scattare diversi trigger (guardia, prepare,
 * export_init, audit, notifiche): un solo UPDATE/INSERT su centinaia di righe
 * supera lo statement_timeout del ruolo authenticated (8 s). Qui tutto viene
 * spezzato in blocchi da 25, in sequenza, senza fermarsi al primo errore.
 * Cosa viene scritto non cambia: cambia solo come viene spezzato.
 */
import { supabase } from "@/integrations/supabase/client";

export const DIMENSIONE_BLOCCO_RICHIESTE = 25;

export type Avanzamento = (fatte: number, totali: number) => void;

function blocchi<T>(arr: T[], n = DIMENSIONE_BLOCCO_RICHIESTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function msg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e);
}

async function conUnRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

export type EsitoInvio = {
  inviate: number;
  giaInviate: number;
  rimasteInBozza: { id: string; cliente: string }[];
  errori: string[];
};

/** Invia in approvazione le bozze indicate. Una richiesta non più in bozza non viene mai ritoccata. */
export async function inviaRichiesteInApprovazione(ids: string[], onAvanzamento?: Avanzamento): Promise<EsitoInvio> {
  const unici = Array.from(new Set(ids));
  const errori: string[] = [];
  let fatte = 0;
  onAvanzamento?.(0, unici.length);
  for (const b of blocchi(unici)) {
    try {
      await conUnRetry(async () => {
        const { error } = await supabase
          .from("richieste_fido")
          .update({ stato: "in_approvazione", data_invio: new Date().toISOString() })
          .in("id", b)
          .eq("stato", "bozza")
          .select("id");
        if (error) throw error;
      });
    } catch (e) {
      errori.push(msg(e));
    }
    fatte += b.length;
    onAvanzamento?.(fatte, unici.length);
  }
  // Rilettura finale dal DB: fa fede lo stato reale, non la risposta (che può andare in timeout).
  let inviate = 0;
  const rimasteInBozza: { id: string; cliente: string }[] = [];
  const visti = new Set<string>();
  for (const b of blocchi(unici, 200)) {
    const { data, error } = await supabase
      .from("richieste_fido")
      .select("id, stato, clienti(ragione_sociale)")
      .in("id", b);
    if (error) { errori.push(`Rilettura: ${msg(error)}`); continue; }
    for (const r of (data ?? []) as any[]) {
      visti.add(r.id);
      if (r.stato === "bozza") rimasteInBozza.push({ id: r.id, cliente: r.clienti?.ragione_sociale ?? "—" });
      else inviate++;
    }
  }
  return { inviate, giaInviate: 0, rimasteInBozza, errori: [...errori, ...(visti.size < unici.length ? [`${unici.length - visti.size} richieste non trovate`] : [])] };
}

/**
 * Variante con conoscenza dello stato iniziale: separa le richieste inviate ora
 * da quelle che risultavano già fuori bozza prima del click.
 */
export async function inviaBozzeInApprovazione(
  righe: { id: string; stato: string }[],
  onAvanzamento?: Avanzamento,
): Promise<EsitoInvio> {
  const giaInviate = righe.filter((r) => r.stato !== "bozza").length;
  const daInviare = righe.filter((r) => r.stato === "bozza").map((r) => r.id);
  const esito = await inviaRichiesteInApprovazione(daInviare, onAvanzamento);
  return { ...esito, giaInviate };
}

export type EsitoDecisione = {
  riuscite: number;
  nonRiuscite: { id: string; cliente: string; motivo: string }[];
};

/**
 * Approva/rifiuta in blocco: una chiamata a processa_richiesta_fido per riga (regola invariata),
 * senza fermarsi al primo errore. Alla fine rilegge lo stato dal DB.
 */
export async function decidiRichiesteInBlocco<R extends { id: string; clienti?: { ragione_sociale?: string | null } | null }>(
  righe: R[],
  esito: "approvata" | "rifiutata",
  processa: (r: R) => Promise<void>,
  onAvanzamento?: Avanzamento,
): Promise<EsitoDecisione> {
  const motivi = new Map<string, string>();
  let fatte = 0;
  onAvanzamento?.(0, righe.length);
  for (const r of righe) {
    try {
      await processa(r);
    } catch (e) {
      motivi.set(r.id, msg(e));
    }
    fatte++;
    onAvanzamento?.(fatte, righe.length);
  }
  const statoFinale = new Map<string, string>();
  for (const b of blocchi(righe.map((r) => r.id), 200)) {
    const { data, error } = await supabase.from("richieste_fido").select("id, stato").in("id", b);
    if (error) continue;
    for (const x of data ?? []) statoFinale.set(x.id, x.stato as string);
  }
  let riuscite = 0;
  const nonRiuscite: EsitoDecisione["nonRiuscite"] = [];
  for (const r of righe) {
    const s = statoFinale.get(r.id);
    // Approvazione multilivello: "approvata" o avanzata di livello (resta in_approvazione senza errore).
    const ok = s !== undefined ? (esito === "rifiutata" ? s === "rifiutata" : !motivi.has(r.id) || s === "approvata") : !motivi.has(r.id);
    if (ok) riuscite++;
    else nonRiuscite.push({ id: r.id, cliente: r.clienti?.ragione_sociale ?? "—", motivo: motivi.get(r.id) ?? "Stato non aggiornato" });
  }
  return { riuscite, nonRiuscite };
}

/** UPDATE dello stesso patch su molti id, a blocchi. Restituisce righe aggiornate ed errori. */
export async function aggiornaRichiesteABlocchi(
  ids: string[],
  patch: Record<string, unknown>,
  onAvanzamento?: Avanzamento,
): Promise<{ aggiornate: number; errori: string[] }> {
  const errori: string[] = [];
  let aggiornate = 0;
  let fatte = 0;
  for (const b of blocchi(Array.from(new Set(ids)))) {
    try {
      const n = await conUnRetry(async () => {
        const { data, error } = await supabase.from("richieste_fido").update(patch as never).in("id", b).select("id");
        if (error) throw error;
        return data?.length ?? 0;
      });
      aggiornate += n;
    } catch (e) {
      errori.push(msg(e));
    }
    fatte += b.length;
    onAvanzamento?.(fatte, ids.length);
  }
  return { aggiornate, errori };
}

/**
 * INSERT di molte richieste a blocchi da 25. Un blocco fallito NON viene ritentato:
 * un timeout può aver comunque salvato il blocco e il retry creerebbe doppioni.
 */
export async function inserisciRichiesteABlocchi(
  payload: Record<string, unknown>[],
  onAvanzamento?: Avanzamento,
): Promise<{ create: number; errori: string[] }> {
  const errori: string[] = [];
  let create = 0;
  let fatte = 0;
  for (const b of blocchi(payload)) {
    const { error, count } = await supabase.from("richieste_fido").insert(b as never, { count: "exact" });
    if (error) errori.push(msg(error));
    else create += count ?? b.length;
    fatte += b.length;
    onAvanzamento?.(fatte, payload.length);
  }
  return { create, errori };
}
