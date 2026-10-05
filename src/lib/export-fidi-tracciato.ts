/**
 * Generazione UNICA del tracciato gestionale (.xls BIFF8) per i fidi approvati.
 *
 * Usato da:
 *  - Import/Export: "Fidi approvati (tracciato gestionale)"
 *  - Fidi da processare: "Genera file per selezionate"
 *
 * Garantisce output IDENTICO byte-per-byte: stesso formato OLE2 (D0CF11E0),
 * stesso foglio "Foglio1", stesse colonne, stesso ordine, stessa dedup logic.
 *
 * NON modificare qui senza tenere allineati entrambi i punti d'uso.
 *
 * Regola per riga (doppia decisione FM38):
 *  - Cod.pag. / Des.pag.: se esito_condizione_pagamento === 'approvata' e la
 *    richiesta ha condizione_pagamento_cod → codice PROPOSTO e la sua descrizione
 *    dalla tabella codici_pagamento (stringa vuota se manca, mai la descrizione
 *    vecchia). In tutti gli altri casi (rifiutata, NULL/storico, nessuna proposta)
 *    → anagrafica cliente, come prima.
 *  - Fido: se esito_fido === 'rifiutata' (approvata solo la condizione) → fido
 *    ATTUALE del cliente (getFidoAttuale), cosi' l'import non cambia il fido.
 *    In tutti gli altri casi → importo_approvato, come prima.
 *  Le richieste storiche (esiti NULL) producono righe identiche a prima.
 */
import * as XLSX from "xlsx";
import { getFidoAttuale, FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";

export type RawRichiestaTracciato = {
  id?: string;
  cliente_id: string | null;
  importo_approvato: number | string | null;
  condizione_pagamento_cod?: string | null;
  esito_fido?: string | null;
  esito_condizione_pagamento?: string | null;
  clienti?: {
    fido_gestionale?: number | string | null;
    codice_gestionale?: string | number | null;
    ragione_sociale?: string | null;
    condizione_pagamento_cod?: string | null;
    condizione_pagamento_desc?: string | null;
    condizioni_pagamento?: string | null;
    stores?: { codice?: string | number | null } | null;
  } | null;
};

export type TracciatoRow = {
  Codice_ditta: number;
  Indicatore_cliente_fornitore: number;
  Codice: number | string;
  "Ragione sociale": string;
  Sede: number | string;
  "Cod.pag.": string;
  "Des.pag.": string;
  Fido: number;
  Codice_rischio: number;
  Tipo_controllo_fido: number;
};

export type GeneraTracciatoResult = {
  fileName: string;
  rows: TracciatoRow[];
  /** id delle richieste effettivamente incluse (post-dedup per cliente). */
  includedRichiestaIds: string[];
};

/** Header SELECT consigliato per chi recupera i dati grezzi via PostgREST. */
/** Campi del cliente necessari al tracciato (da usare dentro `clienti(...)`). */
export const TRACCIATO_CLIENTE_CAMPI =
  `codice_gestionale, ragione_sociale, condizione_pagamento_cod, condizione_pagamento_desc, condizioni_pagamento, ${FIDO_CLIENTE_SELECT}, stores(codice)`;

/** Campi della richiesta necessari al tracciato. */
export const TRACCIATO_RICHIESTA_CAMPI =
  "id, cliente_id, importo_approvato, condizione_pagamento_cod, esito_fido, esito_condizione_pagamento, data_chiusura, created_at";

export const TRACCIATO_FIDI_SELECT =
  `${TRACCIATO_RICHIESTA_CAMPI}, clienti!inner(${TRACCIATO_CLIENTE_CAMPI})`;

/** Opzioni del tracciato: descrizioni dei codici pagamento (chiave = codice trim+maiuscolo). */
export type TracciatoOpts = { descrizioniCodici: Map<string, string> };

/** Costruisce la mappa codice→descrizione dalla tabella codici_pagamento. */
export function mappaDescrizioniCodici(
  codici: { cod: string; descrizione: string | null }[] | null | undefined,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of codici ?? []) m.set(String(c.cod).trim().toUpperCase(), c.descrizione ?? "");
  return m;
}

/**
 * Costruisce le righe del tracciato (dedup per cliente_id mantenendo la prima
 * occorrenza — usare un ordering "piu' recente prima" lato chiamante).
 */
export function buildTracciatoRows(
  data: RawRichiestaTracciato[],
  opts: TracciatoOpts,
): { rows: TracciatoRow[]; includedRichiestaIds: string[] } {
  const seen = new Set<string>();
  const rows: TracciatoRow[] = [];
  const ids: string[] = [];
  for (const r of data ?? []) {
    if (!r.cliente_id || seen.has(r.cliente_id)) continue;
    seen.add(r.cliente_id);
    const cli = r.clienti ?? {};
    const codCli = cli.codice_gestionale ?? "";
    const codNum = /^\d+$/.test(String(codCli)) ? Number(codCli) : (codCli as string | number);
    const sedeCod = cli.stores?.codice ?? "";
    const sedeNum = /^\d+$/.test(String(sedeCod)) ? Number(sedeCod) : (sedeCod as string | number);
    const codProposto = (r.condizione_pagamento_cod ?? "").trim();
    const usaProposta = r.esito_condizione_pagamento === "approvata" && codProposto !== "";
    rows.push({
      Codice_ditta: 1,
      Indicatore_cliente_fornitore: 0,
      Codice: codNum,
      "Ragione sociale": cli.ragione_sociale ?? "",
      Sede: sedeNum,
      "Cod.pag.": usaProposta ? codProposto : cli.condizione_pagamento_cod ?? "",
      "Des.pag.": usaProposta
        ? opts.descrizioniCodici.get(codProposto.toUpperCase()) ?? ""
        : cli.condizione_pagamento_desc ?? cli.condizioni_pagamento ?? "",
      Fido: r.esito_fido === "rifiutata" ? getFidoAttuale(cli) : Number(r.importo_approvato ?? 0),
      Codice_rischio: 1,
      Tipo_controllo_fido: 0,
    });
    if (r.id) ids.push(r.id);
  }
  rows.sort((a, b) => {
    const sa = String(a.Sede), sb = String(b.Sede);
    if (sa !== sb) return sa.localeCompare(sb, "it", { numeric: true });
    return String(a.Codice).localeCompare(String(b.Codice), "it", { numeric: true });
  });
  return { rows, includedRichiestaIds: ids };
}

/**
 * Genera e fa scaricare il file .xls (BIFF8/OLE2). Lancia se il browser non
 * riesce a costruire il binario; in quel caso il chiamante NON deve marcare
 * nulla come processato.
 */
export function generaTracciatoFidiGestionale(
  data: RawRichiestaTracciato[],
  opts: TracciatoOpts & { fileName?: string },
): GeneraTracciatoResult {
  const { rows, includedRichiestaIds } = buildTracciatoRows(data, opts);
  const fileName =
    opts.fileName ?? `fidi_approvati_gestionale_${new Date().toISOString().slice(0, 10)}.xls`;

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      "Codice_ditta",
      "Indicatore_cliente_fornitore",
      "Codice",
      "Ragione sociale",
      "Sede",
      "Cod.pag.",
      "Des.pag.",
      "Fido",
      "Codice_rischio",
      "Tipo_controllo_fido",
    ],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Foglio1");
  const buf = XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { fileName, rows, includedRichiestaIds };
}
