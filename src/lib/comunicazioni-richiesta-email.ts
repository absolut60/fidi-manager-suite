// Modulo PURO (client e server): composizione dell'email "nuovo messaggio
// sulla richiesta fido". Estratto identico da `sendNotificaComunicazione` (FM41 fetta 1).
import { escHtml, buildEmailTemplate } from "@/lib/email-template";

/**
 * Gemello documentato dell'elenco ruoli dentro la RPC SQL `invia_comunicazione_richiesta`
 * (ramo destinatario approvatore/tutti). Se cambia là, va cambiato qui.
 * Qui serve solo a VALIDARE i destinatari, non a sceglierli.
 */
export const RUOLI_DESTINATARI_COMUNICAZIONE_FIDO = [
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "amministratore",
  "amministrazione",
  "direzione",
] as const;

export function buildNotificaComunicazioneEmail(p: {
  toName: string;
  autoreNome: string;
  richiestaId: string;
  testo: string;
  appUrl: string;
}): { subject: string; html: string } {
  const { toName, autoreNome, richiestaId, testo, appUrl } = p;
  const safeTesto = testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return {
    subject: `💬 Nuovo messaggio sulla richiesta fido`,
    html: buildEmailTemplate({
      title: "Nuovo messaggio sulla tua richiesta fido",
      body: `
        <p>Gentile ${escHtml(toName)},</p>
        <p><strong>${escHtml(autoreNome)}</strong> ha inviato un messaggio sulla richiesta fido:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#f3f4f6;border-left:3px solid #1e3a8a;border-radius:4px;color:#374151;font-style:italic;">
          ${safeTesto}
        </blockquote>
        <p>Accedi al gestionale per rispondere.</p>
      `,
      ctaText: "Vai alla richiesta",
      ctaUrl: `${appUrl}/richieste/${richiestaId}`,
    }),
  };
}
