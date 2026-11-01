// FM55 fetta 5: testi brevi della riga della proposta fido massiva (fonte unica, solo presentazione).

const euro = (n: number) => `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions).format(Math.round(n))} €`;

export const AVVISO_FIDO_ZERO = "Con fido a zero il cliente resta bloccato: solo pagamento alla consegna.";

/** Avviso rosso: valore nella casella 0, fido attuale > 0, cliente non già bloccato/in legale. */
export function mostraAvvisoFidoZero({ valore, fidoAttuale, regola }: {
  valore: number; fidoAttuale: number; regola: string;
}): boolean {
  if (regola === "cliente_bloccato" || regola === "gestione_legale") return false;
  return Number(valore) === 0 && Number(fidoAttuale) > 0;
}

export type EtichettaRiga = { tono: "rossa" | "arancione"; testo: string } | null;

/** Al massimo una etichetta: rossa "Da autorizzare" vince su arancione "Ordini oltre il fido". */
export function etichettaRigaProposta(segnalazioni: readonly string[] | null | undefined): EtichettaRiga {
  const s = segnalazioni ?? [];
  if (s.includes("oltre_normale")) return { tono: "rossa", testo: "Da autorizzare" };
  if (s.includes("ordini_oltre_fido")) return { tono: "arancione", testo: "Ordini oltre il fido" };
  return null;
}

/** Una sola frase del perché; la spiegazione completa resta nei dettagli. */
export function fraseBreveProposta(t: {
  regola_applicata?: string | null;
  segnalazioni?: readonly string[] | null;
  scaduto_oltre?: number | null;
  scaduto_oltre_giorni?: number | null;
  acquisto_mensile?: number | null;
  ciclo_gg?: number | null;
  spiegazione?: string | null;
} | null | undefined, fidoAttuale: number, consigliato: number): string | null {
  if (!t) return null;
  const scaduto = t.regola_applicata === "scaduto_non_incassato" || (t.segnalazioni ?? []).includes("scaduto_non_incassato");
  if (scaduto && Number(t.scaduto_oltre ?? 0) > 0) {
    return `Scaduto non pagato ${euro(Number(t.scaduto_oltre))} da ${Number(t.scaduto_oltre_giorni ?? 0).toLocaleString("it-IT")} giorni: fido a zero finché non rientra.`;
  }
  const frasi = (t.spiegazione ?? "").split(/(?<=\.)\s+/).map((f) => f.trim()).filter(Boolean);
  if (consigliato < fidoAttuale) {
    const freno = frasi.find((f) => /^Negli ultimi \d+ giorni|^Ha ordini aperti per/.test(f));
    if (freno) return freno;
  }
  if (t.acquisto_mensile != null && t.ciclo_gg != null && Number(t.acquisto_mensile) > 0) {
    return `Compra in media ${euro(Number(t.acquisto_mensile))} al mese e paga in circa ${Math.round(Number(t.ciclo_gg)).toLocaleString("it-IT")} giorni.`;
  }
  return frasi[0] ?? null;
}
