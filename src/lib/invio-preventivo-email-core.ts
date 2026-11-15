// Parte pura dell'invio preventivo via email: validazione destinatari e costruzione dei testi.
// Usata dal server (invio) e dai test; nessun import di supabase.
import { z } from "zod";
import { isEmailValida } from "@/lib/email-validazione";
import { renderTemplate, wrapEmailHtml, type DatiPreventivoEmail, type DatiSede, type DatiMittente } from "@/lib/template-email-render";

export const MAX_INDIRIZZI_PREVENTIVO = 10;
export const MAX_PDF_PREVENTIVO_BYTES = 10 * 1024 * 1024;

export const inputInvioPreventivo = z.object({
  preventivoId: z.string().uuid(),
  oggetto: z.string().trim().min(1, "L'oggetto è obbligatorio").max(300),
  corpo: z.string().trim().min(1, "Il testo è obbligatorio"),
  to: z.array(z.string()).min(1, "Indica almeno un destinatario"),
  cc: z.array(z.string()).default([]),
  bcc: z.array(z.string()).default([]),
  pdf: z.object({ filename: z.string().min(1).max(150), base64: z.string().min(1) }),
}).superRefine((d, ctx) => {
  const tutti = [...d.to, ...d.cc, ...d.bcc].map(e => e.trim());
  for (const e of tutti) if (!isEmailValida(e)) ctx.addIssue({ code: "custom", message: `Indirizzo email non valido: ${e || "(vuoto)"}` });
  if (tutti.length > MAX_INDIRIZZI_PREVENTIVO) ctx.addIssue({ code: "custom", message: `Massimo ${MAX_INDIRIZZI_PREVENTIVO} indirizzi in totale tra destinatari, copia e copia nascosta.` });
  const visti = new Set<string>();
  for (const e of tutti.map(x => x.toLowerCase())) { if (visti.has(e)) ctx.addIssue({ code: "custom", message: `Indirizzo ripetuto: ${e}` }); visti.add(e); }
});
export type InvioPreventivoInput = z.input<typeof inputInvioPreventivo>;

export function isPdfBytes(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Oggetto e HTML finali: variabili del preventivo, cornice della sede del preventivo, piè GDPR. */
export function costruisciEmailPreventivo(args: {
  oggetto: string; corpo: string; ragioneSociale: string; preventivo: DatiPreventivoEmail;
  sede: DatiSede | null; mittente: DatiMittente;
}) {
  const sembraHtml = /<[a-z][\s\S]*>/i.test(args.corpo);
  const sorgente = { oggetto: args.oggetto, corpo: sembraHtml ? args.corpo : args.corpo.replace(/\n/g, "<br/>") };
  const base = renderTemplate(sorgente, { ragione_sociale: args.ragioneSociale, nome_operatore: args.mittente.nome, scadenze: [], preventivo: args.preventivo }, { tipo: "invio_preventivo" });
  const opts = { senzaBande: true, piedeRiservatezza: true } as const;
  return {
    oggetto: base.oggetto,
    htmlInvio: wrapEmailHtml(base.corpo, args.sede, args.mittente, { ...opts, useCid: true }),
    htmlArchivio: wrapEmailHtml(base.corpo, args.sede, args.mittente, opts),
  };
}

export const TIPO_TEMPLATE_INVIO_PREVENTIVO = "invio_preventivo";
/** Modelli ammessi nei selettori del recupero e dell'invio massivo: mai quelli d'invio preventivo. */
export const isTemplateRecupero = (t: { tipo: string | null }) => t.tipo !== TIPO_TEMPLATE_INVIO_PREVENTIVO;
export const templateInvioPreventivo = <T extends { tipo: string | null; attivo?: boolean | null }>(lista: readonly T[]) =>
  lista.filter(t => t.tipo === TIPO_TEMPLATE_INVIO_PREVENTIVO && t.attivo !== false);

/** Destinatario proposto: cliente → prima valorizzata tra email, email_2, email_3, PEC; lead → la sua email. */
export function destinatarioPropostoPreventivo(
  cliente: { email?: string | null; email_2?: string | null; email_3?: string | null; pec?: string | null } | null | undefined,
  lead: { email?: string | null } | null | undefined,
): string {
  const candidati = cliente ? [cliente.email, cliente.email_2, cliente.email_3, cliente.pec] : [lead?.email];
  return candidati.map(e => (e ?? "").trim()).find(Boolean) ?? "";
}

/** Corpo HTML del modello → testo modificabile (il server rimette gli a capo). */
export function htmlInTestoSemplice(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}
