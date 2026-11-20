/**
 * FM90: parti della scheda Cerved che usano dati interni MADE. Dipendono solo da datiMade
 * (true per il cliente, false per il lead, che non è cliente MADE).
 */
export function partiMadeCerved(datiMade: boolean) {
  return { fidoMade: datiMade, comePagaMade: datiMade, confrontoMade: datiMade } as const;
}
