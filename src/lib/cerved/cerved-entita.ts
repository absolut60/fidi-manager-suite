/** Entità che può collegarsi a un soggetto Cerved: esattamente un cliente o un lead (FM90). */
export type EntitaCerved = "cliente" | "lead";

/** Sole cifre della partita IVA (spazi, prefisso IT e simboli scartati). */
export function pivaCifre(piva: string | null | undefined): string {
  return String(piva ?? "").replace(/\D/g, "");
}

/** Colonna di cerved_soggetti/cerved_report/cerved_fotografie che identifica l'entità. */
export function colonnaEntitaCerved(entita: EntitaCerved): "cliente_id" | "lead_id" {
  return entita === "cliente" ? "cliente_id" : "lead_id";
}

/** Origine esplicita da salvare: valorizza solo la colonna dell'entità, mai entrambe. */
export function filtroEntitaCerved(entita: EntitaCerved, id: string): { cliente_id: string | null; lead_id: string | null } {
  return entita === "cliente" ? { cliente_id: id, lead_id: null } : { cliente_id: null, lead_id: id };
}

export const NOME_ENTITA_CERVED: Record<EntitaCerved, string> = { cliente: "Cliente", lead: "Lead" };

/** Quota contrattuale indicativa, condivisa da tutte le ricerche entity_search. */
export const QUOTA_RICERCHE_CERVED_ANNUA = 10_000;
