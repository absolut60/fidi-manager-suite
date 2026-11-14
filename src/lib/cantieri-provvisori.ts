/**
 * Cantiere provvisorio (FM65 B3): vero cantiere del cliente con segno cantieri.provvisorio.
 * Fonte unica per filtro lista e conteggi marketing (i provvisori non si contano).
 */
export type FiltroProvvisorio = "tutti" | "provvisori" | "confermati";
/** L'opzione iniziale vale solo in creazione; in modifica prevale il dato salvato. */
export function provvisorioInizialeCantiere(cantiere: { provvisorio?: boolean | null } | null | undefined, iniziale = false): boolean {
  return cantiere ? cantiere.provvisorio === true : iniziale;
}
export const FILTRI_PROVVISORIO: Array<{ valore: FiltroProvvisorio; label: string }> = [
  { valore: "tutti", label: "Provvisori e confermati" },
  { valore: "provvisori", label: "Solo provvisori" },
  { valore: "confermati", label: "Solo confermati" },
];
export function passaFiltroProvvisorio(c: { provvisorio?: boolean | null }, f: string): boolean {
  if (f === "provvisori") return c.provvisorio === true;
  if (f === "confermati") return c.provvisorio !== true;
  return true;
}
/** Conteggi del profilo marketing: esclusi i cantieri provvisori. */
export function contaCantieriMarketing(cantieri: Array<{ attivo?: boolean | null; provvisorio?: boolean | null }>) {
  const confermati = cantieri.filter((c) => c.provvisorio !== true);
  const attivi = confermati.filter((c) => c.attivo).length;
  return { totali: confermati.length, attivi, chiusi: Math.max(0, confermati.length - attivi) };
}
