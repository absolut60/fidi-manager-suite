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
  Partial<Pick<FidoTeoricoRow, "ordini_fuori" | "tetto" | "valore_senza_tetto" | "acquisto_mensile">>;

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
  scaduto_da_incassare: {
    etichetta: "Scaduto da incassare",
    gravita: "arancione",
    testo: (r) => {
      const pag = r.pagato_12m ?? 0;
      const perc = pag > 0 ? Math.round(((r.scaduto_oltre ?? 0) / pag) * 100) : 0;
      return `Scaduto da incassare: ${formatEuro(r.scaduto_oltre ?? 0)} oltre soglia (fino a ${r.scaduto_oltre_giorni ?? 0} giorni), pari al ${perc.toLocaleString("it-IT")}% di quanto pagato in 12 mesi`;
    },
  },
  impegni_sopra_base: {
    etichetta: "Acquisti sopra il previsto",
    gravita: "arancione",
    testo: (r) =>
      `Acquisti sopra il previsto: impegni ${formatEuro(r.fabbisogno ?? 0)} contro una base di ${formatEuro(r.base ?? 0)}`,
  },
  ordine_fuori_giro: {
    etichetta: "Ordini fuori dal giro normale",
    gravita: "arancione",
    testo: (r) =>
      `Ordini fuori dal giro normale: ${formatEuro(r.ordini_fuori ?? 0)} oltre 1 mese di acquisti (ordini ${formatEuro(r.ordini_aperti ?? 0)}, acquisti medi ${formatEuro(r.acquisto_mensile ?? 0)}/mese) — da autorizzare`,
  },
  oltre_tetto: {
    etichetta: "Impegni oltre il tetto",
    gravita: "arancione",
    testo: (r) =>
      `Impegni oltre il tetto: impegni ${formatEuro(r.fabbisogno ?? 0)}, tetto ${formatEuro(r.tetto ?? 0)} (1,5 × base) — da autorizzare`,
  },
  uso_pieno: {
    etichetta: "Uso pieno del fido",
    gravita: "info",
    testo: (r) => {
      const g = r.fido_attuale ?? 0;
      const perc = g > 0 ? Math.round(((r.fabbisogno ?? 0) / g) * 100) : 0;
      return `Uso pieno del fido: ${perc.toLocaleString("it-IT")}% del fido Gamma`;
    },
  },
};

const ORDINE = Object.keys(SEGNALAZIONI_FIDO);

/** Segnalazioni note della riga, ordinate per gravità (codici sconosciuti ignorati). */
export function segnalazioniRiga(
  r: RigaSegnalazione & { segnalazioni: string[] },
): { codice: string; etichetta: string; gravita: GravitaSegnalazione; testo: string }[] {
  return ORDINE.filter((c) => r.segnalazioni.includes(c)).map((c) => {
    const d = SEGNALAZIONI_FIDO[c];
    return { codice: c, etichetta: d.etichetta, gravita: d.gravita, testo: d.testo(r) };
  });
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
