/** Solo la finestra Nuovo: il documento resta creato anche se il primo blocco fallisce. */
export async function creaConPrimoBlocco<T extends { preventivo: { id: string } }>(
  crea: () => Promise<T>,
  aggiungiBlocco: (id: string, ordine: number) => Promise<unknown>,
): Promise<T & { erroreBlocco: boolean }> {
  const risultato = await crea();
  try {
    await aggiungiBlocco(risultato.preventivo.id, 1);
    return { ...risultato, erroreBlocco: false };
  } catch {
    return { ...risultato, erroreBlocco: true };
  }
}