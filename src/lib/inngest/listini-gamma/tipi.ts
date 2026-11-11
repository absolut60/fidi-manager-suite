/** Stato di un foglio nell'import unico "Articoli, fornitori e listini (Gamma)". */
export type StatoFoglio = {
  etichetta: string;
  foglio: string;
  stato: "in_attesa" | "in_corso" | "completato" | "errore";
  righe: number;
  lotto: number;
  lotti: number;
  conteggi: Record<string, number>;
  anomalie: number;
  errore?: string;
};

export type StatoImportListini = {
  fogli: Record<string, StatoFoglio>;
  /** Fogli del file senza gestore: ignorati, non sono anomalie. */
  non_gestiti: string[];
};

/** Chiave in importazioni.report_saltati dove vive lo stato per foglio (letta anche dalla UI). */
export const CHIAVE_STATO_LISTINI = "articoli_listini_gamma";
