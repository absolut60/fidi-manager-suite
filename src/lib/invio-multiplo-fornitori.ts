// FM62 G5: regole pure dell'invio email / lettere a più fornitori (browser-safe).
// Usate dalle server function, dal job Inngest invio-fornitori e dai test.
import { z } from "zod";
import { isEmailValida } from "@/lib/email-validazione";
import { corpoHtmlFornitore, oggettoFornitore, nuovoAllegatoFornitore } from "@/lib/comunicazioni-fornitore";

export const MAX_FORNITORI_INVIO = 500;
export const MAX_FORNITORI_LETTERE = 200;
export const SEGNAPOSTO_RAGIONE_SOCIALE = "{{ragione_sociale}}";

const ids = (max: number, cosa: string) => z.array(z.string().uuid()).min(1, "Seleziona almeno un fornitore.")
  .max(max, `Massimo ${max} fornitori per ${cosa}.`).transform(v => [...new Set(v)]);

export const avviaInvioFornitoriInput = z.object({
  chiaveInvio: z.string().uuid(),
  fornitoriIds: ids(MAX_FORNITORI_INVIO, "invio"),
  oggetto: oggettoFornitore,
  html: corpoHtmlFornitore,
  nuoviAllegati: z.array(nuovoAllegatoFornitore).max(20),
});
export const lettereFornitoriInput = z.object({
  fornitoriIds: ids(MAX_FORNITORI_LETTERE, "stampa"),
  oggetto: oggettoFornitore,
  html: corpoHtmlFornitore,
});
export const letteraFornitoreInput = z.object({
  fornitoreId: z.string().uuid(),
  oggetto: oggettoFornitore,
  html: corpoHtmlFornitore,
  salvaInAttivita: z.boolean(),
});
export type StatoInvioMultiplo = "in_corso" | "completato" | "con_errori";

/** Destinatari: un solo indirizzo per fornitore (fornitori.email), i senza email valida sono saltati. */
export function pianificaInvioFornitori<T extends { id: string; email: string | null }>(fornitori: T[]) {
  const visti = new Set<string>();
  const destinatari: (T & { email: string })[] = [];
  const saltati: T[] = [];
  for (const f of fornitori) {
    if (visti.has(f.id)) continue;
    visti.add(f.id);
    const e = f.email?.trim() ?? "";
    if (e && isEmailValida(e)) destinatari.push({ ...f, email: e }); else saltati.push(f);
  }
  return { destinatari, saltati };
}

/** Righe ancora da spedire: un retry del job salta chi ha già un esito (anti-doppione per fornitore). */
export function righeDaSpedire<T extends { stato: string }>(righe: T[]): T[] {
  return righe.filter(r => r.stato === "in_invio");
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** {{ragione_sociale}} (anche con spazi) → nome del fornitore, con escape HTML. */
export function applicaSegnapostoFornitore(html: string, ragioneSociale: string | null): string {
  return html.replace(/\{\{\s*ragione_sociale\s*\}\}/gi, escHtml(ragioneSociale?.trim() || "Fornitore"));
}
export function applicaSegnapostoTesto(testo: string, ragioneSociale: string | null): string {
  return testo.replace(/\{\{\s*ragione_sociale\s*\}\}/gi, ragioneSociale?.trim() || "Fornitore");
}

/** Stato finale dell'invio dai conteggi. */
export function statoFinaleInvio(c: { totale: number; inviati: number; errori: number }): StatoInvioMultiplo {
  if (c.inviati + c.errori < c.totale) return "in_corso";
  return c.errori > 0 ? "con_errori" : "completato";
}

/** Testo dell'unica notifica di fine invio. */
export function messaggioFineInvio(c: { inviati: number; errori: number; saltati: number }, oggetto: string) {
  const n = (x: number, s: string, p: string) => `${x.toLocaleString("it-IT")} ${x === 1 ? s : p}`;
  const parti = [n(c.inviati, "inviata", "inviate")];
  if (c.errori) parti.push(n(c.errori, "non riuscita", "non riuscite"));
  if (c.saltati) parti.push(n(c.saltati, "fornitore senza email", "fornitori senza email"));
  return { titolo: c.errori ? "Invio ai fornitori concluso con errori" : "Invio ai fornitori concluso", messaggio: `"${oggetto}": ${parti.join(", ")}.` };
}
