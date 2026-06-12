import { supabase } from "@/integrations/supabase/client";
import { classificaScadenza } from "@/lib/scadenze";
import type { DatiSede as DatiSedeRender } from "@/lib/template-email-render";

// Re-export delle funzioni pure (rendering) dal modulo isomorfo.
export {
  PLACEHOLDERS,
  formatEuro,
  formatDateIt,
  buildElencoScadenzeHtml,
  renderTemplate,
  wrapEmailHtml,
  SEDE_FALLBACK,
  LOGO_EMAIL_URL,
} from "@/lib/template-email-render";
export type {
  PlaceholderKey,
  ScadenzaSollecito,
  DatiTemplate,
  RenderedTemplate,
  DatiSede,
  DatiMittente,
} from "@/lib/template-email-render";

export type TemplateEmail = {
  id: string;
  nome: string;
  oggetto: string;
  corpo: string;
  tipo: string;
  attivo: boolean;
};

import type { DatiTemplate } from "@/lib/template-email-render";

export async function caricaDatiCliente(
  clienteId: string,
  nomeOperatore: string,
): Promise<DatiTemplate> {
  const { data: cliente, error: e1 } = await supabase
    .from("clienti")
    .select("ragione_sociale")
    .eq("id", clienteId)
    .maybeSingle();
  if (e1) throw e1;

  const { data: rawScad, error: e2 } = await supabase
    .from("scadenze")
    .select("numero_documento, data_scadenza, importo_scadenza, stato_contabile, giorni_ritardo, tempi_scadenza")
    .eq("cliente_id", clienteId)
    .order("data_scadenza", { ascending: true });
  if (e2) throw e2;

  const scadute = (rawScad ?? []).filter((s) => classificaScadenza(s) === "scaduto");

  return {
    ragione_sociale: cliente?.ragione_sociale ?? "",
    nome_operatore: nomeOperatore,
    scadenze: scadute.map((s) => ({
      numero_documento: s.numero_documento,
      data_scadenza: s.data_scadenza,
      importo_scadenza: s.importo_scadenza,
    })),
  };
}
