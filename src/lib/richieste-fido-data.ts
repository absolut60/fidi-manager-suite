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
 *  - condPagProposta    = richieste_fido.condizione_pagamento_cod (proposta)
 *  - condPagAttuale     = clienti.condizione_pagamento_cod (attuale, gestionale)
 *  - condPagAttualeDesc = clienti.condizione_pagamento_desc ?? clienti.condizioni_pagamento
 *  - condPagPrecedente  = richieste_fido.condizione_pagamento_precedente_cod
 *                       (condizione del cliente AL MOMENTO della decisione; NULL se non decisa
 *                        o se decisa prima della doppia decisione FM38)
 *  - condPagRiferimento = condPagPrecedente ?? condPagAttuale
 *  - cambioCondPag      = condizionePagamentoCambiata(proposta, riferimento) (src/lib/fidi.ts)
 *  - esitoFido / esitoCondPag = richieste_fido.esito_fido / esito_condizione_pagamento
 *                       ('approvata'|'rifiutata'|NULL; NULL = richiesta storica o non decisa)
 *  - soloCondizione     = stato approvata && esitoFido rifiutata && esitoCondPag approvata
 *                       (importo_approvato = fido del cliente al momento, NON un fido concesso)
 */

import { getFidoAttuale, FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";
import { condizionePagamentoCambiata } from "@/lib/fidi";
import { semaforoDaCliente, type SemaforoStadio } from "@/lib/semaforo-ui";

/** Frammento di SELECT PostgREST condiviso (join cliente + store + profili). */
export const RICHIESTA_FIDO_SELECT = `
  *,
  clienti(
    id,
    ragione_sociale,
    partita_iva,
    codice_fiscale,
    codice_gestionale,
    codice_agente,
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
    condizione_pagamento_cod,
    dilazione_concordata,
    dilazione_effettiva,
    bloccato,
    in_gestione_legale,
    cliente_attivo,
    ultima_data_fatturazione,
    ultima_sincronizzazione,
    stores(nome, codice),
    fido_teorico_cliente(semaforo_stadio, semaforo_motivo)
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
  /** Semaforo affidabilita' materializzato (fido_teorico_cliente). */
  semaforoStadio: SemaforoStadio;
  semaforoMotivo: string | null;
  condPagProposta: string | null;
  condPagAttuale: string | null;
  condPagAttualeDesc: string | null;
  condPagPrecedente: string | null;
  condPagRiferimento: string | null;
  cambioCondPag: boolean;
  esitoFido: string | null;
  esitoCondPag: string | null;
  soloCondizione: boolean;
}

/**
 * Normalizza la riga richiesta_fido (con join clienti/stores/profili) nei
 * campi canonici usati dalle viste. Non perde la riga originale (`raw`).
 */
export function mapRichiestaFido(r: AnyRecord): RichiestaFidoView {
  const c = r?.clienti ?? null;
  const store = c?.stores ?? null;
  const stato = String(r?.stato ?? "");
  const sem = semaforoDaCliente(c);
  const condPagPrecedente: string | null = r?.condizione_pagamento_precedente_cod ?? null;
  const condPagAttuale: string | null = c?.condizione_pagamento_cod ?? null;
  const condPagRiferimento = condPagPrecedente ?? condPagAttuale;
  const esitoFido: string | null = r?.esito_fido ?? null;
  const esitoCondPag: string | null = r?.esito_condizione_pagamento ?? null;
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
    semaforoStadio: sem.stadio,
    semaforoMotivo: sem.motivo,
    condPagProposta: r?.condizione_pagamento_cod ?? null,
    condPagAttuale,
    condPagAttualeDesc: c?.condizione_pagamento_desc ?? c?.condizioni_pagamento ?? null,
    condPagPrecedente,
    condPagRiferimento,
    cambioCondPag: condizionePagamentoCambiata(r?.condizione_pagamento_cod, condPagRiferimento),
    esitoFido,
    esitoCondPag,
    soloCondizione: stato === "approvata" && esitoFido === "rifiutata" && esitoCondPag === "approvata",
  };
}

/**
 * Importo da usare per l'etichetta del tipo (etichettaTipoRichiesta):
 * approvato se presente, altrimenti richiesto. Nel caso "solo condizione"
 * l'importo approvato è il fido del cliente, non un fido concesso: si usa il richiesto.
 */
export function importoPerEtichettaTipo(r: AnyRecord): number {
  const v = mapRichiestaFido(r);
  return v.soloCondizione || v.importoApprovato == null ? v.importo : v.importoApprovato;
}

export function mapRichiesteFido(rows: AnyRecord[] | null | undefined): RichiestaFidoView[] {
  return (rows ?? []).map(mapRichiestaFido);
}
