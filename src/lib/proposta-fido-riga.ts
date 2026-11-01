// FM55 fetta 5: testi brevi della riga della proposta fido massiva (fonte unica, solo presentazione).
import { motivoRigaProposta, type MotivoRigaProposta } from "@/lib/proposta-fido-visibilita";

const euro = (n: number) => `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions).format(Math.round(n))} €`;

export const AVVISO_FIDO_ZERO = "Con fido a zero il cliente resta bloccato: solo pagamento alla consegna.";

/** Avviso rosso: valore nella casella 0, fido attuale > 0, cliente non già bloccato/in legale. */
export function mostraAvvisoFidoZero({ valore, fidoAttuale, regola }: {
  valore: number; fidoAttuale: number; regola: string;
}): boolean {
  if (regola === "cliente_bloccato" || regola === "gestione_legale") return false;
  return Number(valore) === 0 && Number(fidoAttuale) > 0;
}

export type EtichettaRiga = { tono: "rosso_scuro" | "rossa" | "viola" | "arancione"; testo: string } | null;

/** Al massimo una etichetta, decisa dal motivo vincente (fonte unica: motivoRigaProposta). */
export function etichettaRigaProposta({ regola, segnalazioni }: {
  regola: string;
  segnalazioni?: readonly string[] | null;
}): EtichettaRiga {
  const motivo = motivoRigaProposta({ regola, segnalazioni });
  if (motivo === "bloccato") return { tono: "rosso_scuro", testo: "Bloccato" };
  if (motivo === "legale") return { tono: "rosso_scuro", testo: "In legale" };
  if (motivo === "scaduto") return { tono: "rossa", testo: "Scaduto non pagato" };
  if (motivo === "da_autorizzare") return { tono: "viola", testo: "Da autorizzare: compra molto più del solito" };
  if (motivo === "ordini_oltre_fido") return { tono: "arancione", testo: "Ordini oltre il fido" };
  return null;
}

/** Classi colore della riga e del badge per motivo (token del tema, niente colori fissi). */
export const CLASSI_MOTIVO_RIGA: Record<Exclude<MotivoRigaProposta, null>, { bordo: string; sfondo: string; badge: string; pallino: string }> = {
  scaduto: {
    bordo: "border-l-4 border-l-motivo-scaduto",
    sfondo: "bg-motivo-scaduto-bg",
    badge: "bg-motivo-scaduto-bg text-motivo-scaduto hover:bg-motivo-scaduto-bg",
    pallino: "bg-motivo-scaduto",
  },
  bloccato: {
    bordo: "border-l-8 border-l-motivo-bloccato",
    sfondo: "bg-motivo-bloccato-bg",
    badge: "bg-motivo-bloccato text-motivo-bloccato-fg hover:bg-motivo-bloccato",
    pallino: "bg-motivo-bloccato",
  },
  legale: {
    bordo: "border-l-8 border-l-motivo-bloccato",
    sfondo: "bg-motivo-bloccato-bg",
    badge: "bg-motivo-bloccato text-motivo-bloccato-fg hover:bg-motivo-bloccato",
    pallino: "bg-motivo-bloccato",
  },
  da_autorizzare: {
    bordo: "border-l-4 border-l-motivo-autorizzare",
    sfondo: "bg-motivo-autorizzare-bg",
    badge: "bg-motivo-autorizzare-bg text-motivo-autorizzare hover:bg-motivo-autorizzare-bg",
    pallino: "bg-motivo-autorizzare",
  },
  ordini_oltre_fido: {
    bordo: "border-l-4 border-l-motivo-ordini",
    sfondo: "bg-motivo-ordini-bg",
    badge: "bg-motivo-ordini-bg text-motivo-ordini hover:bg-motivo-ordini-bg",
    pallino: "bg-motivo-ordini",
  },
};

/** Legenda dei quattro motivi colorati, in cima all'elenco. */
export const LEGENDA_MOTIVI: { motivo: Exclude<MotivoRigaProposta, null>; nome: string }[] = [
  { motivo: "bloccato", nome: "Bloccato o in legale" },
  { motivo: "scaduto", nome: "Scaduto non pagato" },
  { motivo: "da_autorizzare", nome: "Da autorizzare" },
  { motivo: "ordini_oltre_fido", nome: "Ordini oltre il fido" },
];

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
