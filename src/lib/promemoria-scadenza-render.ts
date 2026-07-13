// Fonte UNICA per il rendering del promemoria di scadenza.
// Usato sia dal job Inngest (invio reale, useCid=true) sia dall'anteprima
// in Impostazioni (rendering nell'iframe, useCid=false). Nessun side-effect,
// nessun import di supabase: e' un puro compositore di HTML.
import {
  renderTemplate,
  wrapEmailHtml,
  type DatiMittente,
  type DatiSede,
  type ScadenzaSollecito,
} from "@/lib/template-email-render";

export type PromemoriaScadenzaTemplate = { oggetto: string; corpo: string };

export type BuildPromemoriaEmailInput = {
  template: PromemoriaScadenzaTemplate;
  ragioneSociale: string;
  scadenze: ScadenzaSollecito[];
  sede: DatiSede | null;
  mittente: DatiMittente;
  useCid: boolean;
};

export type BuildPromemoriaEmailResult = {
  oggetto: string;
  html: string;
};

/**
 * Compone oggetto + HTML del promemoria di scadenza usando esattamente la
 * stessa pipeline dei solleciti: renderTemplate (con colonna Metodo per il
 * promemoria) + wrapEmailHtml (header MADE, banda "Promemoria di scadenza",
 * box "Avviso di cortesia", coordinate bancarie, firma operatore, footer sede).
 * L'unica differenza tra invio reale e anteprima e' `useCid`:
 *   - true  -> <img src="cid:logoMade"> (allegato inline lato edge function)
 *   - false -> URL pubblico del logo (per rendering nel browser)
 */
export function buildPromemoriaEmail(
  input: BuildPromemoriaEmailInput,
): BuildPromemoriaEmailResult {
  const rendered = renderTemplate(
    input.template,
    {
      ragione_sociale: input.ragioneSociale,
      scadenze: input.scadenze,
      nome_operatore: input.mittente.nome,
    },
    { tipo: "promemoria_scadenza", speseImportoUnitario: 0 },
  );
  const html = wrapEmailHtml(rendered.corpo, input.sede, input.mittente, {
    useCid: input.useCid,
    tipo: "promemoria_scadenza",
  });
  return { oggetto: rendered.oggetto, html };
}
