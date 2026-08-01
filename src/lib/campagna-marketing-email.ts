import { renderTemplate, wrapEmailHtml, type DatiSede } from "@/lib/template-email-render";

/** Placeholder supportati nelle campagne marketing (editor + invio reale). */
export const PLACEHOLDER_MARKETING: { key: string; descr: string; esempio: string }[] = [
  { key: "ragione_sociale", descr: "Denominazione del cliente", esempio: "Cliente di Esempio S.r.l." },
  { key: "citta", descr: "Città del cliente", esempio: "Milano" },
  { key: "agente", descr: "Agente assegnato al cliente", esempio: "Mario Rossi" },
  { key: "categoria", descr: "Categoria merceologica del cliente", esempio: "Edilizia" },
];

export type DatiCampagnaCliente = {
  ragione_sociale: string;
  citta: string;
  agente: string;
  categoria: string;
};

function sostituisci(testo: string, dati: DatiCampagnaCliente): string {
  let out = testo ?? "";
  // {{ragione_sociale}} è gestito dal motore condiviso (renderTemplate);
  // qui sostituiamo gli altri campi cliente.
  const map: Record<string, string> = {
    citta: dati.citta,
    agente: dati.agente,
    categoria: dati.categoria,
  };
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), v ?? "");
  }
  return out;
}

/**
 * Footer di recesso — OBBLIGATORIO in ogni email di campagna (GDPR).
 * - Con token contatto: link personale alla pagina pubblica /recesso/{token}.
 * - Senza token (destinatari 'aziendale', privi di contatto_id): fallback
 *   testuale che invita a rispondere all'email per essere rimossi.
 */
export function footerRecessoHtml(linkRecesso: string | null): string {
  const testo = linkRecesso
    ? `Non desideri più ricevere queste comunicazioni? <a href="${linkRecesso}" style="color:#c94f8f;text-decoration:underline;">Gestisci le tue preferenze</a>.`
    : `Non desideri più ricevere queste comunicazioni? Rispondi a questa email scrivendo "CANCELLAMI" e ti rimuoveremo dalle nostre liste.`;
  return `
    <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;line-height:1.5;">
      ${testo}
    </div>`;
}

/**
 * Compone oggetto + HTML completo di un'email di campagna marketing.
 * Stessa pipeline per anteprima, invio di prova e invio reale.
 */
export function buildEmailCampagna(params: {
  oggetto: string;
  corpo: string;
  dati: DatiCampagnaCliente;
  sede?: DatiSede | null;
  mittente?: { nome: string; email?: string | null };
  linkRecesso: string | null;
  useCid: boolean;
}): { oggetto: string; html: string } {
  const mittente = params.mittente ?? { nome: "Ufficio Marketing MADE" };
  const reso = renderTemplate(
    {
      oggetto: sostituisci(params.oggetto, params.dati),
      corpo: sostituisci(params.corpo, params.dati),
    },
    { ragione_sociale: params.dati.ragione_sociale, scadenze: [], nome_operatore: mittente.nome },
    { tipo: "libero" },
  );

  const corpoConFooter = reso.corpo + footerRecessoHtml(params.linkRecesso);

  return {
    oggetto: reso.oggetto,
    html: wrapEmailHtml(corpoConFooter, params.sede ?? null, mittente, {
      useCid: params.useCid,
      tipo: "libero",
      senzaBande: true,
      sottotitolo: "Comunicazione commerciale",
    }),
  };
}

export const DATI_ESEMPIO: DatiCampagnaCliente = {
  ragione_sociale: "Cliente di Esempio S.r.l.",
  citta: "Milano",
  agente: "Mario Rossi",
  categoria: "Edilizia",
};
