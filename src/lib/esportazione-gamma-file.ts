import * as XLSX from 'xlsx';
import { COLONNE_FILE_GAMMA, type RigaFileGamma } from './esportazione-gamma';

/** Excel 97–2003: intestazione completa anche per colonne mai valorizzate. */
export function scriviFileGammaXls(righe: readonly RigaFileGamma[]): Uint8Array {
  const foglio = XLSX.utils.aoa_to_sheet([
    [...COLONNE_FILE_GAMMA],
    ...righe.map(r => COLONNE_FILE_GAMMA.map(c => r[c])),
  ], { cellDates: false, dateNF: 'dd/mm/yyyy', UTC: true });
  for (let i = 0; i < righe.length; i++) {
    for (let j = 0; j < COLONNE_FILE_GAMMA.length; j++) {
      const colonna = COLONNE_FILE_GAMMA[j];
      const valore = colonna ? righe[i]?.[colonna] : undefined;
      const cella = foglio[XLSX.utils.encode_cell({ r: i + 1, c: j })];
      if (cella && valore instanceof Date) cella.z = 'dd/mm/yyyy';
      if (cella && colonna === 'PRZ1' && typeof valore === 'number') cella.z = '0.0000';
    }
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, foglio, 'Sheet1');
  return new Uint8Array(XLSX.write(libro, { bookType: 'biff8', type: 'array' }));
}

/** Nome fisso; il parametro data resta accettato per i chiamanti preesistenti. */
export function nomeFileGamma(_data?: Date): string {
  return 'ORDINI_CLIENTI_FORNITORI.xls';
}