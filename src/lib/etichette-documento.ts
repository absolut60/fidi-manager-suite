/** Nomi del documento condivisi dall'editor, dalle finestre e dalla stampa. */
export function etichetteDocumento(tipo: string | null | undefined) {
  const ordine = tipo === 'ordine';
  const testo = (originale: string) => !ordine ? originale : originale
    .replace(/del preventivo/g, "dell'ordine")
    .replace(/dal preventivo/g, "dall'ordine")
    .replace(/al preventivo/g, "all'ordine")
    .replace(/nel preventivo/g, "nell'ordine")
    .replace(/sul preventivo/g, "sull'ordine")
    .replace(/Il preventivo/g, "L'ordine")
    .replace(/il preventivo/g, "l'ordine")
    .replace(/Preventivi/g, 'Ordini').replace(/preventivi/g, 'ordini')
    .replace(/Preventivo\b(?!\.[A-Za-z_])/g, 'Ordine').replace(/preventivo\b(?!\.[A-Za-z_])/g, 'ordine');
  return { nome: ordine ? 'ordine' : 'preventivo', titolo: testo('Preventivo'),
    nuovo: testo('Nuovo preventivo'), articolo: testo('il preventivo'),
    da: testo('dal preventivo'), testo };
}