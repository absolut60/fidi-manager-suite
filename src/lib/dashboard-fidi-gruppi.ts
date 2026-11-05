/**
 * FM56: righe delle card della Dashboard fidi.
 * Numeri: solo public.get_dashboard_fidi_gruppi(); liste: solo public.get_clienti_dashboard_fidi_ids(card, gruppo).
 * Qui solo etichette, lettura delle righe e codifica del filtro della lista clienti: nessun calcolo.
 */

export type RigaGruppo = {
  card: string;
  gruppo: string;
  n_clienti: number;
  importo: number;
  n_aumenti: number;
  n_riduzioni: number;
  n_con_fido: number;
};

export const CATEGORIE_DASHBOARD = ["imprese", "privati", "bloccati", "legale", "contanti_pos"] as const;
export const CATEGORIE_OLTRE = ["imprese", "privati", "bloccati", "legale"] as const;

export const ETICHETTE_CATEGORIA: Record<string, string> = {
  imprese: "Imprese",
  privati: "Privati",
  bloccati: "Bloccati",
  legale: "In gestione legale",
  contanti_pos: "Contanti / POS",
};

export const ETICHETTE_CARD: Record<string, string> = {
  concesso: "Fido concesso",
  proposto: "Fido proposto",
  variazione: "Variazione",
  oltre: "Esposizione oltre il fido",
  fermi: "Clienti fermi",
  occhio: "Fidi da tenere d'occhio",
};

export const ETICHETTE_OCCHIO: Record<string, string> = {
  vicini: "Vicini al limite (consumo dall'80%)",
  piu: "Comprano più del solito",
  ordini: "Ordini aperti: potenzialmente oltre fido",
  totale: "Totale",
};

export function etichettaRiga(card: string, gruppo: string): string {
  if (card === "occhio") return ETICHETTE_OCCHIO[gruppo] ?? gruppo;
  if (card === "concesso" && gruppo === "fermi") return "Clienti fermi";
  if (card === "oltre" && gruppo === "contanti_pos") return "Esclusi contanti/POS";
  return ETICHETTE_CATEGORIA[gruppo] ?? gruppo;
}

/** Testo del chip nella lista clienti. */
export function etichettaChipDashboard(card: string, gruppo: string): string {
  return `Dashboard fidi: ${ETICHETTE_CARD[card] ?? card} · ${etichettaRiga(card, gruppo)}`;
}

const VUOTA: Omit<RigaGruppo, "card" | "gruppo"> = { n_clienti: 0, importo: 0, n_aumenti: 0, n_riduzioni: 0, n_con_fido: 0 };

export function normalizzaGruppi(data: unknown): RigaGruppo[] {
  const n = (x: unknown) => Number(x ?? 0) || 0;
  return ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).map((r) => ({
    card: String(r.card),
    gruppo: String(r.gruppo),
    n_clienti: n(r.n_clienti),
    importo: n(r.importo),
    n_aumenti: n(r.n_aumenti),
    n_riduzioni: n(r.n_riduzioni),
    n_con_fido: n(r.n_con_fido),
  }));
}

export function riga(righe: RigaGruppo[], card: string, gruppo: string): RigaGruppo {
  return righe.find((r) => r.card === card && r.gruppo === gruppo) ?? { card, gruppo, ...VUOTA };
}

/** Somma di righe già calcolate dal database (solo per il totale delle card composte). */
export function sommaRighe(righe: RigaGruppo[], card: string, gruppi: readonly string[]) {
  return gruppi.reduce(
    (s, g) => {
      const r = riga(righe, card, g);
      return { n_clienti: s.n_clienti + r.n_clienti, importo: s.importo + r.importo };
    },
    { n_clienti: 0, importo: 0 },
  );
}

/** Filtro della lista clienti: "card:gruppo". */
export const PREFISSO_PRESET = "df:";
export function codificaFiltroDashboard(card: string, gruppo: string): string {
  return `${card}:${gruppo}`;
}
export function decodificaFiltroDashboard(v: unknown): { card: string; gruppo: string } | null {
  if (typeof v !== "string") return null;
  const m = /^([a-z_]+):([a-z_]+)$/.exec(v);
  if (!m || !ETICHETTE_CARD[m[1]]) return null;
  return { card: m[1], gruppo: m[2] };
}
