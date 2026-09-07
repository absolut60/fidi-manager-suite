/**
 * Salute di una campagna email in corso.
 *
 * Logica delle soglie: il job di invio processa un blocco di 12 email e poi
 * attende una pausa di 60 s, quindi in condizioni normali un invio avviene
 * ogni ~96 s. Se passano piu' di 10 minuti senza alcun invio mentre restano
 * destinatari da inviare, il job e' fermo (morto) e non ripartira' da solo.
 *
 * Soglie (secondi dall'ultimo invio, o dall'avvio se non ha ancora inviato):
 *   < 180  -> attiva
 *   180-600 -> rallentata
 *   > 600  -> bloccata
 */

export type LivelloSalute = "attiva" | "rallentata" | "bloccata" | "nd";

export type SaluteCampagna = {
  livello: LivelloSalute;
  secondiDaUltimo: number | null;
};

const SOGLIA_RALLENTATA_SEC = 180;
const SOGLIA_BLOCCATA_SEC = 600;

export function classificaSaluteCampagna(params: {
  ultimoInvioAt: string | Date | null | undefined;
  avviataAt: string | Date | null | undefined;
  daInviare?: number;
  now: number | Date;
}): SaluteCampagna {
  const { ultimoInvioAt, avviataAt, now } = params;
  const riferimentoRaw = ultimoInvioAt ?? avviataAt ?? null;
  if (!riferimentoRaw) return { livello: "nd", secondiDaUltimo: null };

  const rif = riferimentoRaw instanceof Date ? riferimentoRaw : new Date(riferimentoRaw);
  const t = rif.getTime();
  if (Number.isNaN(t)) return { livello: "nd", secondiDaUltimo: null };

  const nowMs = now instanceof Date ? now.getTime() : now;
  const secondi = Math.max(0, Math.round((nowMs - t) / 1000));

  if (secondi < SOGLIA_RALLENTATA_SEC) return { livello: "attiva", secondiDaUltimo: secondi };
  if (secondi <= SOGLIA_BLOCCATA_SEC) return { livello: "rallentata", secondiDaUltimo: secondi };
  return { livello: "bloccata", secondiDaUltimo: secondi };
}

/** Durata compatta: "45s", "12m", "2h 5m". */
export function fmtDurataBreve(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const ore = Math.floor(min / 60);
  const resto = min % 60;
  return `${ore}h ${resto}m`;
}
