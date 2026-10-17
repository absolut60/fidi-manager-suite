/**
 * Consegna un workbook SheetJS tramite salvaFile (fonte unica di salvataggio,
 * src/lib/salva-file.ts) al posto di XLSX.writeFile, che su iPhone apre il file
 * senza poterlo salvare. Il formato si ricava dall'estensione, come fa XLSX.writeFile.
 */
import * as XLSX from "xlsx";
import { salvaFile } from "@/lib/salva-file";

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv;charset=utf-8",
};

export function salvaWorkbook(wb: XLSX.WorkBook, nomeFile: string): Promise<void> {
  const ext = (nomeFile.split(".").pop() ?? "xlsx").toLowerCase();
  const bookType = (ext === "xls" ? "biff8" : ext === "csv" ? "csv" : "xlsx") as XLSX.BookType;
  const buf = XLSX.write(wb, { bookType, type: "array" }) as ArrayBuffer;
  const blob = new Blob([buf], { type: MIME[ext] ?? MIME.xlsx });
  return salvaFile(blob, nomeFile);
}
