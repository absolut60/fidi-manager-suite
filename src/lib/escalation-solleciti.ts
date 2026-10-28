// FONTE UNICA TS della mappa livello di sollecito -> tipo di template email (FM51).
// Gemello SQL dello stadio per cliente: public.get_stadio_sollecito_clienti
// (stadio, livello successivo, attesa minima, scaduto, gestione legale).
// Modulo PURO: niente import di supabase, usabile da browser e da Inngest.
import { livelloSollecitoFromTipo } from "@/lib/template-email-render";

export type LivelloSollecito = 1 | 2 | 3;

export const TIPO_TEMPLATE_PER_LIVELLO: Record<LivelloSollecito, "sollecito_1" | "sollecito_2" | "messa_in_mora"> = {
  1: "sollecito_1",
  2: "sollecito_2",
  3: "messa_in_mora",
};

const ETICHETTA_LIVELLO: Record<LivelloSollecito, string> = {
  1: "Primo sollecito",
  2: "Secondo sollecito",
  3: "Messa in mora",
};

/** Riga restituita da public.get_stadio_sollecito_clienti. */
export type StadioSollecito = {
  cliente_id: string;
  stadio: 0 | 1 | 2 | 3;
  stadio_data: string | null;
  stadio_giorni: number | null;
  livello_successivo: LivelloSollecito;
  ripetizione_mora: boolean;
  giorni_minimi: number;
  attesa_ok: boolean;
  data_prossimo_possibile: string | null;
  totale_scaduto: number;
  in_gestione_legale: boolean;
};

export type TemplatePerEscalation = {
  id: string;
  tipo: string;
  attivo: boolean;
};

/**
 * Restituisce l'unico modello attivo per il livello indicato.
 * Errore se ne risultano zero o più di uno.
 */
export function scegliTemplatePerLivello<T extends TemplatePerEscalation>(
  templatesAttivi: readonly T[],
  livello: LivelloSollecito,
): T {
  const candidati = templatesAttivi.filter(
    (t) => t.attivo && livelloSollecitoFromTipo(t.tipo) === livello,
  );
  if (candidati.length !== 1) {
    throw new Error(
      `Serve un solo modello attivo per il ${ETICHETTA_LIVELLO[livello]}: oggi ne risultano ${candidati.length}`,
    );
  }
  return candidati[0];
}
