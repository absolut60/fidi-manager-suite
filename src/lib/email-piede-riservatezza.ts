/**
 * FONTE UNICA del piè di pagina riservatezza/ambiente per le email ESTERNE
 * (clienti, contatti, lead, iscritti, assicurazione). Non va nelle email
 * interne ai collaboratori. Funzione pura: nessun import di supabase, usabile
 * da browser, server function e job Inngest. Solo tabelle e stili inline
 * (Outlook/Gmail), nessuna immagine esterna.
 */

export const TESTO_RISERVATEZZA_EMAIL =
  "In ottemperanza del regolamento UE 2016/679 (RGPD) si precisa che la presente comunicazione contiene informazioni riservate e confidenziali ed è indirizzata esclusivamente ai destinatari della medesima qui indicati. Le opinioni, le conclusioni e le altre informazioni qui contenute, che non siano relative alla nostra attività caratteristica, devono essere considerate come non inviate né avvalorate da noi. Tutte le informazioni qui contenute sono soggette ai termini e alle condizioni previste dagli accordi che regolano il rapporto con il cliente. Nel caso in cui abbiate ricevuto per errore la presente comunicazione, vogliate cortesemente darcene immediata notizia, e poi procedere alla cancellazione di questo messaggio dal Vostro sistema. È strettamente proibito e potrebbe essere fonte di violazione di legge qualsiasi uso, comunicazione, copia o diffusione dei contenuti di questa comunicazione da parte di chi la abbia ricevuta per errore o in violazione degli scopi della presente.";

/** Le due righe del messaggio ambiente, come nell'originale. */
export const TESTO_AMBIENTE_EMAIL: readonly [string, string] = [
  "Per favore, prima di stampare questa email",
  "considera l'impatto sull'ambiente.",
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Blocco HTML (una tabella al 100%) da porre come ULTIMO elemento della mail. */
export function buildPiedeRiservatezzaHtml(): string {
  const font = "font-family:Arial,Helvetica,sans-serif;";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="padding:16px 24px 8px 24px;${font}font-size:10px;line-height:1.5;color:#808080;font-style:italic;text-align:justify;">${esc(TESTO_RISERVATEZZA_EMAIL)}</td>
  </tr>
  <tr>
    <td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td style="border-top:1px solid #d1d5db;font-size:1px;line-height:1px;height:1px;">&nbsp;</td></tr></table></td>
  </tr>
  <tr>
    <td style="padding:8px 24px 16px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="middle" style="${font}font-size:36px;line-height:40px;color:#3aa655;padding-right:10px;">&#9851;</td>
          <td valign="middle" style="${font}font-size:14px;line-height:1.35;color:#3aa655;font-weight:bold;">${esc(TESTO_AMBIENTE_EMAIL[0])}<br/>${esc(TESTO_AMBIENTE_EMAIL[1])}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
