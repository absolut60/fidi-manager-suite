import * as XLSX from "xlsx";
import type { TipoRichiesta } from "./fidi";

export type StatoExport = "da_esportare" | "esportata" | "processata" | "errore_export";

export const STATO_EXPORT_LABEL: Record<StatoExport, string> = {
  da_esportare: "Da esportare",
  esportata: "Esportata",
  processata: "Processata",
  errore_export: "Errore",
};

export const STATO_EXPORT_TONE: Record<StatoExport, string> = {
  da_esportare: "bg-info/15 text-info",
  esportata: "bg-warning/15 text-warning",
  processata: "bg-success/15 text-success",
  errore_export: "bg-destructive/15 text-destructive",
};

const TIPO_VARIAZIONE: Record<string, string> = {
  nuovo: "NUOVO FIDO",
  nuovo_fido: "NUOVO FIDO",
  aumento: "AUMENTO FIDO",
  diminuzione: "DIMINUZIONE FIDO",
  rinnovo: "RINNOVO FIDO",
};

export function tipoVariazione(t: TipoRichiesta | string | null | undefined): string {
  if (!t) return "NUOVO FIDO";
  return TIPO_VARIAZIONE[t] ?? "NUOVO FIDO";
}

export type ExportRow = {
  codice_cliente: string;
  ragione_sociale: string;
  partita_iva: string;
  tipo_variazione: string;
  importo_precedente: number | null;
  importo_approvato: number;
  data_approvazione: string;
  approvato_da: string;
  note: string;
};

export function generaExcelFidi(rows: ExportRow[]): void {
  const dati = [
    [
      "Codice Cliente",
      "Ragione Sociale",
      "Partita IVA",
      "Tipo Variazione",
      "Importo Precedente",
      "Importo Approvato",
      "Data Approvazione",
      "Approvato Da",
      "Note",
    ],
    ...rows.map((r) => [
      r.codice_cliente,
      r.ragione_sociale,
      r.partita_iva,
      r.tipo_variazione,
      r.importo_precedente ?? 0,
      r.importo_approvato,
      r.data_approvazione,
      r.approvato_da,
      r.note,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(dati);
  ws["!cols"] = [
    { wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 18 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 32 },
  ];
  const wb = XLSX.utils.book_new();
  // Il gestionale richiede il nome foglio esatto "Foglio1"
  XLSX.utils.book_append_sheet(wb, ws, "Foglio1");

  const oggi = new Date().toISOString().slice(0, 10);
  // Vero .xls BIFF8 (firma OLE2 D0CF11E0), non .xlsx rinominato.
  // SheetJS community 0.18.5 supporta bookType:'biff8'.
  const buf = XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FidiManager_Export_${oggi}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
