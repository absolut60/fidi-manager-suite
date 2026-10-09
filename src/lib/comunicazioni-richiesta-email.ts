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
  riferimento: {
    cliente: string;
    codiceCliente: string | null;
    tipo: string;
    importo: string | null;
    puntoVendita: string | null;
  };
}): { subject: string; html: string } {
  const { toName, autoreNome, richiestaId, testo, appUrl, riferimento } = p;
  const safeTesto = testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  const clienteSoggetto = riferimento.cliente.replace(/[\r\n]+/g, " ").slice(0, 80);

  const righeRiepilogo: string[] = [];
  const riga = (etichetta: string, valore: string) =>
    `<tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap;">${etichetta}</td>
      <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:bold;vertical-align:top;">${valore}</td>
    </tr>`;
  righeRiepilogo.push(
    riga(
      "Cliente",
      escHtml(riferimento.cliente) +
        (riferimento.codiceCliente ? ` (${escHtml(riferimento.codiceCliente)})` : ""),
    ),
  );
  righeRiepilogo.push(riga("Richiesta", escHtml(riferimento.tipo)));
  if (riferimento.importo) righeRiepilogo.push(riga("Importo richiesto", escHtml(riferimento.importo)));
  if (riferimento.puntoVendita) righeRiepilogo.push(riga("Punto vendita", escHtml(riferimento.puntoVendita)));

  const riepilogo = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;width:100%;">
      ${righeRiepilogo.join("")}
    </table>`;

  return {
    subject: `💬 Nuovo messaggio sulla richiesta fido — ${clienteSoggetto}`,
    html: buildEmailTemplate({
      title: "Nuovo messaggio sulla richiesta fido",
      body: `
        <p>Gentile ${escHtml(toName)},</p>
        ${riepilogo}
        <p><strong>${escHtml(autoreNome)}</strong> ha inviato un messaggio su questa richiesta:</p>
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
