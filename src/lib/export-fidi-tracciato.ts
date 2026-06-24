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
 */
import * as XLSX from "xlsx";

export type RawRichiestaTracciato = {
  id?: string;
  cliente_id: string | null;
  importo_approvato: number | string | null;
  clienti?: {
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
export const TRACCIATO_FIDI_SELECT =
  "id, cliente_id, importo_approvato, data_chiusura, created_at, clienti!inner(codice_gestionale, ragione_sociale, condizione_pagamento_cod, condizione_pagamento_desc, condizioni_pagamento, stores(codice))";

/**
 * Costruisce le righe del tracciato (dedup per cliente_id mantenendo la prima
 * occorrenza — usare un ordering "piu' recente prima" lato chiamante).
 */
export function buildTracciatoRows(
  data: RawRichiestaTracciato[],
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
    rows.push({
      Codice_ditta: 1,
      Indicatore_cliente_fornitore: 0,
      Codice: codNum,
      "Ragione sociale": cli.ragione_sociale ?? "",
      Sede: sedeNum,
      "Cod.pag.": cli.condizione_pagamento_cod ?? "",
      "Des.pag.": cli.condizione_pagamento_desc ?? cli.condizioni_pagamento ?? "",
      Fido: Number(r.importo_approvato ?? 0),
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
  opts?: { fileName?: string },
): GeneraTracciatoResult {
  const { rows, includedRichiestaIds } = buildTracciatoRows(data);
  const fileName =
    opts?.fileName ?? `fidi_approvati_gestionale_${new Date().toISOString().slice(0, 10)}.xls`;

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
