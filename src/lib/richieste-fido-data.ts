/**
 * UNICA fonte dei dati per le richieste fido.
 *
 * Tutti i campi mostrati nelle viste (lista "Richieste fido", coda
 * "Approvazioni", dettaglio richiesta) devono passare da qui. Cosi' un dato
 * non puo' divergere tra una pagina e l'altra.
 *
 * Definizioni canoniche (allineate alla scheda cliente):
 *  - importo        = richieste_fido.importo_richiesto
 *  - fidoAttuale    = clienti.fido_gestionale   (NON fido_aziendale_concesso)
 *  - totRischio     = clienti.totale_rischio    (stessa fonte della scheda cliente)
 *  - scaduto        = clienti.scaduto           (stessa fonte della scheda cliente)
 *  - storeNome      = clienti.stores.nome / .codice (sede del CLIENTE)
 *  - storeId        = clienti.store_id
 *  - dataInvio      = richieste_fido.data_invio
 *                     (fallback created_at se la richiesta non e' piu' in bozza)
 *  - richiedente    = profili (FK richieste_fido_created_by_fkey)
 *  - approvatore    = profili (FK richieste_fido_approvato_da_fkey)
 *  - livelloRichiesto / livelloCorrente / stato / tipo / motivazione
 */

import { getFidoAttuale, FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";

/** Frammento di SELECT PostgREST condiviso (join cliente + store + profili). */
export const RICHIESTA_FIDO_SELECT = `
  *,
  clienti(
    id,
    ragione_sociale,
    partita_iva,
    store_id,
    ${FIDO_CLIENTE_SELECT},
    totale_rischio,
    fido_residuo,
    scaduto,
    a_scadere,
    num_insoluti,
    doc_da_fatturare,
    doc_da_evadere,
    effetti_a_rischio,
    condizioni_pagamento,
    condizione_pagamento_desc,
    dilazione_concordata,
    dilazione_effettiva,
    bloccato,
    in_gestione_legale,
    cliente_attivo,
    ultima_data_fatturazione,
    ultima_sincronizzazione,
    stores(nome, codice)
  ),
  richiedente:profili!richieste_fido_created_by_fkey(nome, cognome, email),
  approvatore:profili!richieste_fido_approvato_da_fkey(nome, cognome, email)
`;

type AnyRecord = Record<string, any>;

function userLabel(p: AnyRecord | null | undefined): string {
  if (!p) return "—";
  const n = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  return n || p.email || "—";
}

export interface RichiestaFidoView {
  raw: AnyRecord;
  id: string;
  stato: string;
  tipo: string;
  importo: number;
  importoApprovato: number | null;
  livelloRichiesto: number;
  livelloCorrente: number;
  /** Data invio reale (data_invio) con fallback created_at se non piu' in bozza. */
  dataInvio: string | null;
  dataChiusura: string | null;
  motivazione: string | null;
  cliente: AnyRecord | null;
  clienteId: string | null;
  ragioneSociale: string;
  storeId: string | null;
  storeNome: string;
  fidoAttuale: number;
  totRischio: number;
  scaduto: number;
  richiedente: AnyRecord | null;
  richiedenteLabel: string;
  approvatore: AnyRecord | null;
  approvatoreLabel: string;
}

/**
 * Normalizza la riga richiesta_fido (con join clienti/stores/profili) nei
 * campi canonici usati dalle viste. Non perde la riga originale (`raw`).
 */
export function mapRichiestaFido(r: AnyRecord): RichiestaFidoView {
  const c = r?.clienti ?? null;
  const store = c?.stores ?? null;
  const stato = String(r?.stato ?? "");
  const dataInvio =
    r?.data_invio ?? (stato && stato !== "bozza" ? r?.created_at ?? null : null);
  return {
    raw: r,
    id: String(r?.id ?? ""),
    stato,
    tipo: String(r?.tipo ?? ""),
    importo: Number(r?.importo_richiesto ?? 0),
    importoApprovato: r?.importo_approvato == null ? null : Number(r.importo_approvato),
    livelloRichiesto: Number(r?.livello_richiesto ?? 0),
    livelloCorrente: Number(r?.livello_corrente ?? 0),
    dataInvio,
    dataChiusura: r?.data_chiusura ?? null,
    motivazione: r?.motivazione ?? null,
    cliente: c,
    clienteId: c?.id ?? r?.cliente_id ?? null,
    ragioneSociale: c?.ragione_sociale ?? "—",
    storeId: c?.store_id ?? null,
    storeNome: store?.nome ?? store?.codice ?? "—",
    fidoAttuale: getFidoAttuale(c),
    totRischio: Number(c?.totale_rischio ?? 0),
    scaduto: Number(c?.scaduto ?? 0),
    richiedente: r?.richiedente ?? r?.profilo ?? null,
    richiedenteLabel: userLabel(r?.richiedente ?? r?.profilo ?? null),
    approvatore: r?.approvatore ?? null,
    approvatoreLabel: userLabel(r?.approvatore ?? null),
  };
}

export function mapRichiesteFido(rows: AnyRecord[] | null | undefined): RichiestaFidoView[] {
  return (rows ?? []).map(mapRichiestaFido);
}
