/** Limiti del tracciato Gamma, condivisi da compilazione ed esportazione. */
export const LIMITI_GAMMA = { codiceArticolo: 25, descrizione: 70 } as const;

export function codiceArticoloNuovo(marcaCodice: string | null | undefined, codiceFornitore: string | null | undefined): string | null {
  const marca = marcaCodice?.replace(/\s/g, '').toUpperCase();
  const fornitore = codiceFornitore?.replace(/\s/g, '').toUpperCase();
  return marca && fornitore ? marca + fornitore : null;
}

/** Controlli della finestra manuale; famiglia e lunghezza codice restano avvisi non bloccanti. */
export function validazioneManualeGamma(descrizione: string, um2: string, fattore: number | null, fattoreCompilato: boolean) {
  return {
    descrizioneValida: descrizione.trim().length > 0 && descrizione.length <= LIMITI_GAMMA.descrizione,
    fattoreValido: !um2.trim() && !fattoreCompilato || fattore != null && Number.isFinite(fattore) && fattore > 0
      && Math.abs(fattore * 10000 - Math.round(fattore * 10000)) < 0.000001,
  };
}