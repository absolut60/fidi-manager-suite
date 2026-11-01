// FM55 fetta 5: testi brevi della riga della proposta fido massiva (fonte unica, solo presentazione).
import { motivoRigaProposta, type MotivoRigaProposta } from "@/lib/proposta-fido-visibilita";

export type EtichettaRiga = { tono: "rossa" | "arancione" | "viola" | "azzurra"; testo: string } | null;

/** Al massimo una etichetta, decisa dal motivo vincente (fonte unica: motivoRigaProposta). */
export function etichettaRigaProposta({ regola, segnalazioni }: {
  regola: string;
  segnalazioni?: readonly string[] | null;
}): EtichettaRiga {
  const { motivo } = motivoRigaProposta({ regola, segnalazioni });
  if (motivo === "bloccato") return { tono: "rossa", testo: "Bloccato" };
  if (motivo === "legale") return { tono: "rossa", testo: "In legale" };
  if (motivo === "scaduto") return { tono: "arancione", testo: "Cliente con scaduto" };
  if (motivo === "da_autorizzare") return { tono: "viola", testo: "Da autorizzare: compra molto più del solito" };
  if (motivo === "ordini_oltre_fido") return { tono: "azzurra", testo: "Ordini oltre il fido" };
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
  { motivo: "scaduto", nome: "Cliente con scaduto" },
  { motivo: "da_autorizzare", nome: "Da autorizzare" },
  { motivo: "ordini_oltre_fido", nome: "Ordini oltre il fido" },
];

