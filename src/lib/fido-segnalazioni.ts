/**
 * FM55 — Fonte UNICA (lato client) delle segnalazioni del fido.
 * I codici sono calcolati solo da public.segnalazioni_fido al ricalcolo e
 * pubblicati in fido_teorico_cliente.segnalazioni; qui solo etichette e testi.
 */
import { formatEuro } from "@/lib/fidi";
import type { FidoTeoricoRow } from "@/lib/fido-teorico";

export type GravitaSegnalazione = "rossa" | "arancione" | "info";

type RigaSegnalazione = Pick<
  FidoTeoricoRow,
  "fabbisogno" | "base" | "ordini_aperti" | "fido_attuale" | "scaduto_oltre" | "scaduto_oltre_giorni" | "pagato_12m"
> &
  Partial<Pick<FidoTeoricoRow, "esposizione_corrente" | "fido_proposto" | "ordini_fuori" | "tetto" | "valore_senza_tetto" | "acquisto_mensile" | "profilo">>;

/** Esposizione canonica, anche sulle righe precedenti in cui fabbisogno includeva gli ordini. */
export function ciDeve(r: Pick<RigaSegnalazione, "fabbisogno" | "esposizione_corrente" | "ordini_aperti" | "profilo">): number {
  return Number(r.esposizione_corrente ?? r.fabbisogno ?? 0);
}

/** Gli ordini sono informativi e vengono mostrati separatamente. */
export function testoCiDeve(r: Pick<RigaSegnalazione, "fabbisogno" | "esposizione_corrente" | "ordini_aperti" | "profilo">): string {
  return `ci deve ${formatEuro(ciDeve(r))}`;
}

export type DefinizioneSegnalazione = {
  etichetta: string;
  gravita: GravitaSegnalazione;
  testo: (r: RigaSegnalazione) => string;
};

/** Ordine = gravità (come in public.segnalazioni_fido). */
export const SEGNALAZIONI_FIDO: Record<string, DefinizioneSegnalazione> = {
  bloccato: {
    etichetta: "Cliente bloccato",
    gravita: "rossa",
    testo: () => "Cliente bloccato: fido a zero",
  },
  scaduto_non_incassato: {
    etichetta: "Scaduto non incassato",
    gravita: "rossa",
    testo: (r) =>
      `Scaduto non incassato: ${formatEuro(r.scaduto_oltre ?? 0)} oltre soglia (fino a ${r.scaduto_oltre_giorni ?? 0} giorni)`,
  },
  oltre_normale: {
    etichetta: "Molto sopra il suo normale",
    gravita: "rossa",
    testo: (r) => `Sta comprando molto più del solito: fido proposto ${formatEuro(r.fido_proposto ?? 0)} oltre una volta e mezza il fido giusto (${formatEuro(r.tetto ?? 0)}) — da autorizzare`,
  },
  scaduto_da_incassare: {
    etichetta: "Scaduto da incassare",
    gravita: "arancione",
    testo: (r) => {
      const pag = r.pagato_12m ?? 0;
      const perc = pag > 0 ? Math.round(((r.scaduto_oltre ?? 0) / pag) * 100) : 0;
      return `Scaduto da incassare: ${formatEuro(r.scaduto_oltre ?? 0)} oltre soglia (fino a ${r.scaduto_oltre_giorni ?? 0} giorni), pari al ${perc.toLocaleString("it-IT")}% di quanto pagato in 12 mesi`;
    },
  },
  ordini_oltre_fido: {
    etichetta: "Ordini oltre il fido",
    gravita: "arancione",
    testo: (r) => `Ha ordini clienti aperti per ${formatEuro(r.ordini_aperti ?? 0)}: se consegnati, ci dovrebbe ${formatEuro(ciDeve(r) + Number(r.ordini_aperti ?? 0))}, più del fido proposto`,
  },
  // Compatibilità con righe materializzate prima del 01/11; non più prodotti dal calcolo.
  impegni_sopra_base: {
    etichetta: "Acquisti sopra il previsto",
    gravita: "arancione",
    testo: (r) =>
      `Acquisti sopra il previsto: ${testoCiDeve(r)}, contro un fido giusto di ${formatEuro(r.base ?? 0)}`,
  },
  ordine_fuori_giro: {
    etichetta: "Ordini fuori dal giro normale",
    gravita: "arancione",
    testo: (r) =>
      `Ordini fuori dal giro normale: ${formatEuro(r.ordini_fuori ?? 0)} oltre un mese di acquisti (ordini clienti aperti ${formatEuro(r.ordini_aperti ?? 0)}, acquisti medi ${formatEuro(r.acquisto_mensile ?? 0)}/mese) — da autorizzare`,
  },
  oltre_tetto: {
    etichetta: "Oltre il massimo automatico",
    gravita: "arancione",
    testo: (r) =>
      `Oltre il massimo automatico: ${testoCiDeve(r)}; il sistema da solo non propone più di ${formatEuro(r.tetto ?? 0)} (una volta e mezza il fido giusto) — da autorizzare`,
  },
  uso_pieno: {
    etichetta: "Fido in esaurimento",
    gravita: "info",
    testo: (r) => {
      const g = r.fido_attuale ?? 0;
      const perc = g > 0 ? Math.round(((r.fabbisogno ?? 0) / g) * 100) : 0;
      return `Usa il ${perc.toLocaleString("it-IT")}% del fido`;
    },
  },
};

const ORDINE = Object.keys(SEGNALAZIONI_FIDO);

/** Non genera codici: sopprime solo oltre_normale obsoleto sulle righe pre-fetta 3.
 * Il confronto con la soglia normale resta esclusivamente nella fonte SQL.
 */
export function segnalazioniCorrenti(r: {
  segnalazioni?: unknown; fido_proposto?: number | null; fido_attuale?: number | null;
}): string[] {
  const codici = Array.isArray(r.segnalazioni) ? r.segnalazioni.map(String) : [];
  return codici.filter((c) => c !== "oltre_normale" || Number(r.fido_proposto ?? 0) > Number(r.fido_attuale ?? 0));
}

/** Segnalazioni note della riga, ordinate per gravità (codici sconosciuti ignorati). */
export function segnalazioniRiga(
  r: RigaSegnalazione & { segnalazioni: string[] },
): { codice: string; etichetta: string; gravita: GravitaSegnalazione; testo: string }[] {
  const correnti = segnalazioniCorrenti(r);
  return ORDINE.filter((c) => correnti.includes(c)).map((c) => {
    const d = SEGNALAZIONI_FIDO[c];
    return { codice: c, etichetta: d.etichetta, gravita: d.gravita, testo: d.testo(r) };
  });
}

/** Nessun codice corrente richiede il precedente raggruppamento degli acquisti. */
export const CODICI_ACQUISTI_SOPRA: readonly string[] = [];

function etichettaGruppo(codice: string): string {
  return SEGNALAZIONI_FIDO[codice]?.etichetta ?? codice;
}

/** Fonte unica di presentazione: segnalazioni separate, legacy riconosciute, sconosciute ignorate. */
export function raggruppaSegnalazioni(
  r: RigaSegnalazione & { segnalazioni: string[] },
): { codice: string; etichetta: string; gravita: GravitaSegnalazione; testo: string }[] {
  return segnalazioniRiga(r);
}

/** Etichette delle anomalie senza duplicati (es. riquadro "Da autorizzare"). */
export function etichetteSegnalazioni(codici: readonly string[]): string[] {
  const ord = ORDINE.filter((c) => codici.includes(c));
  return [...new Set(ord.map(etichettaGruppo))];
}

/** FM55 3C: segnalazioni arancioni/rosse = anomalie da autorizzare sopra il teorico. */
export function segnalazioniAnomalia(codici: readonly string[] | null | undefined): string[] {
  return (codici ?? []).filter((c) => {
    const g = SEGNALAZIONI_FIDO[c]?.gravita;
    return g === "rossa" || g === "arancione";
  });
}

/** Rosso se c'è almeno una segnalazione di gravità rossa. */
export function anomaliaRossa(codici: readonly string[] | null | undefined): boolean {
  return (codici ?? []).some((c) => SEGNALAZIONI_FIDO[c]?.gravita === "rossa");
}

/**
 * FM55 3C: richiesta sopra il fido teorico di riferimento con anomalie → "Da autorizzare".
 * Solo informativo per chi approva: nessun passaggio di approvazione in più.
 */
export function daAutorizzareRichiesta(
  importo: number | null | undefined,
  riferimento: number | null | undefined,
  codici: readonly string[] | null | undefined,
): { anomalie: string[]; rossa: boolean } | null {
  if (importo == null || riferimento == null || !(Number(importo) > Number(riferimento))) return null;
  const anomalie = segnalazioniAnomalia(codici);
  if (anomalie.length === 0) return null;
  return { anomalie, rossa: anomaliaRossa(anomalie) };
}
