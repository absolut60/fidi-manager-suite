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
