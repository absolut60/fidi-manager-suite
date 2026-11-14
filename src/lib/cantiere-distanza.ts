/** Solo presentazione: non usare per identità, confronti o ricerche. */
export function nomeSedeBreve(nome: string): string {
  return nome.trim().replace(/^SEDE DI\s+/i, "").toLocaleLowerCase("it-IT").replace(/(^|[\s'-])(\p{L})/gu, (_, separatore: string, lettera: string) => separatore + lettera.toLocaleUpperCase("it-IT"));
}

export function formatoDistanzaCantiere(km: number, minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  const h = Math.floor(m / 60);
  const tempo = h ? `${h} h ${m % 60} min` : `${m} min`;
  return `${km.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · ${tempo}`;
}

export function linkIndicazioniCantiere(destinazione: { lat: number | null; lng: number | null }, origine?: { lat: number | null; lng: number | null } | null): string | null {
  if (destinazione.lat == null || destinazione.lng == null) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  if (origine?.lat != null && origine.lng != null) url.searchParams.set("origin", `${origine.lat},${origine.lng}`);
  url.searchParams.set("destination", `${destinazione.lat},${destinazione.lng}`);
  return url.toString();
}