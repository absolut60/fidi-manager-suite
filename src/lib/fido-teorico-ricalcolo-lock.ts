/**
 * Lock unico del ricalcolo del fido teorico (FM55 fetta 4d).
 * Una riga in public.configurazioni (chiave LOCK_CHIAVE) con token, origine, ora di avvio
 * e avanzamento; updated_at è il battito, aggiornato a ogni passo/blocco.
 * Senza avanzamento per SCADENZA_LOCK_MS il lock è scaduto e un nuovo ricalcolo può partire.
 *
 * Modulo senza import: usato dai passi server (pulsante e job Inngest, tramite
 * fido-teorico-ricalcolo-passi.server.ts) e dalla pagina, che legge la stessa riga.
 */

export const LOCK_CHIAVE = "fido_teorico_ricalcolo_lock";
export const SCADENZA_LOCK_MS = 3 * 60 * 1000;

export type OrigineRicalcolo = "automatico" | "manuale";

export type StatoLock = {
  token: string;
  origine: OrigineRicalcolo;
  avviato_at: string;
  fase: FaseRicalcolo;
  blocco: number | null;
  previsti: number | null;
  /** Nome di chi ha avviato il ricalcolo manuale (null per l'automatico o se ignoto). */
  avviato_da?: string | null;
};

export type FaseRicalcolo = "preparazione" | "blocchi" | "chiusura" | "alert" | "avvisi";
const FASI: FaseRicalcolo[] = ["preparazione", "blocchi", "chiusura", "alert", "avvisi"];

export type RigaLock = { valore: string; updated_at: string };

export function leggiStatoLock(valore: string | null | undefined): StatoLock | null {
  if (!valore) return null;
  try {
    const v = JSON.parse(valore) as Partial<StatoLock>;
    if (typeof v?.token !== "string" || typeof v.avviato_at !== "string") return null;
    return {
      token: v.token,
      origine: v.origine === "automatico" ? "automatico" : "manuale",
      avviato_at: v.avviato_at,
      fase: FASI.includes(v.fase as FaseRicalcolo) ? (v.fase as FaseRicalcolo) : "preparazione",
      blocco: typeof v.blocco === "number" ? v.blocco : null,
      previsti: typeof v.previsti === "number" ? v.previsti : null,
      avviato_da: typeof v.avviato_da === "string" && v.avviato_da.trim() ? v.avviato_da.trim() : null,
    };
  } catch {
    return null;
  }
}

export function lockScaduto(riga: RigaLock, ora: number): boolean {
  const t = Date.parse(riga.updated_at);
  return !Number.isFinite(t) || ora - t > SCADENZA_LOCK_MS;
}

/** Ricalcolo attivo visto dalla pagina: null se nessuno o lock scaduto/illeggibile. */
export function ricalcoloAttivo(riga: RigaLock | null, ora: number): StatoLock | null {
  if (!riga || lockScaduto(riga, ora)) return null;
  return leggiStatoLock(riga.valore);
}

export function oraHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

export function testoRicalcoloInCorso(s: StatoLock): string {
  return `Ricalcolo già in corso (avviato alle ${oraHHMM(s.avviato_at)}, ${s.origine}): attendi`;
}

export function testoAvanzamentoLock(s: StatoLock): string {
  if (s.fase === "blocchi" && s.blocco) return s.previsti ? `blocco ${s.blocco} di ${s.previsti}` : `blocco ${s.blocco}`;
  return ETICHETTA_FASE[s.fase].toLowerCase();
}

const ETICHETTA_FASE: Record<FaseRicalcolo, string> = {
  preparazione: "Preparazione",
  blocchi: "Blocchi",
  chiusura: "Chiusura",
  alert: "Aggiornamento alert",
  avvisi: "Invio avvisi",
};

/** Percentuale mostrata: blocchi fino al 95%, poi le fasi finali 96/98/99. */
export function percentualeRicalcolo(s: StatoLock): number {
  if (s.fase === "preparazione") return 0;
  if (s.fase === "chiusura") return 96;
  if (s.fase === "alert") return 98;
  if (s.fase === "avvisi") return 99;
  if (!s.blocco || !s.previsti) return 0;
  return Math.min(95, Math.max(0, Math.round((s.blocco / s.previsti) * 100)));
}

export type BarraRicalcolo =
  | { tipo: "attivo"; stato: StatoLock; titolo: string; etichetta: string; percentuale: number; avviatoAlle: string; compatto: string }
  | { tipo: "interrotto"; testo: string };

/**
 * Stato da mostrare nelle pagine (card, avviso import, Alert fidi, Lista clienti).
 * Lock attivo → barra; lock scaduto (3 minuti senza avanzamento) → "interrotto"; nessun lock → null.
 */
export function barraRicalcolo(riga: RigaLock | null, ora: number): BarraRicalcolo | null {
  if (!riga) return null;
  const s = leggiStatoLock(riga.valore);
  if (!s) return null;
  if (lockScaduto(riga, ora)) {
    return { tipo: "interrotto", testo: `Ricalcolo interrotto alle ${oraHHMM(riga.updated_at)}: puoi rilanciarlo` };
  }
  const percentuale = percentualeRicalcolo(s);
  const chi = s.origine === "automatico" ? "automatico" : s.avviato_da ? `avviato da ${s.avviato_da}` : "manuale";
  const etichetta = s.fase === "blocchi"
    ? (s.blocco ? (s.previsti ? `Blocco ${s.blocco} di ${s.previsti} · ${percentuale}%` : `Blocco ${s.blocco}`) : `Avvio blocchi · ${percentuale}%`)
    : `${ETICHETTA_FASE[s.fase]} · ${percentuale}%`;
  return {
    tipo: "attivo",
    stato: s,
    titolo: `Ricalcolo del fido teorico in corso (${chi})`,
    etichetta,
    percentuale,
    avviatoAlle: `Avviato alle ${oraHHMM(s.avviato_at)}`,
    compatto: `Ricalcolo in corso · ${percentuale}% — i fidi consigliati si stanno aggiornando`,
  };
}

export class ErroreRicalcoloInCorso extends Error {
  constructor(readonly stato: StatoLock) {
    super(testoRicalcoloInCorso(stato));
    this.name = "ErroreRicalcoloInCorso";
  }
}

/** Accesso alla riga: ogni scrittura è condizionata, così due processi non prendono lo stesso lock. */
export type ArchivioLock = {
  leggi: () => Promise<RigaLock | null>;
  /** false se la riga esiste già. */
  inserisci: (valore: string, oraIso: string) => Promise<boolean>;
  /** Sostituisce solo se updated_at è ancora quello letto (lock scaduto). */
  sostituisciSe: (valore: string, oraIso: string, updatedAtLetto: string) => Promise<boolean>;
  /** Aggiorna solo se la riga è ancora di questo token. */
  aggiornaSeToken: (valore: string, oraIso: string, token: string) => Promise<boolean>;
  eliminaSeToken: (token: string) => Promise<void>;
};

export type Avanzamento = Pick<StatoLock, "fase" | "blocco" | "previsti">;

/**
 * Prende il lock o, se è già di questo token, ne aggiorna battito e avanzamento.
 * Con un lock di un altro ricalcolo non scaduto: ErroreRicalcoloInCorso.
 * nuovoAvvio = true azzera l'ora di avvio (avvio o "Ricomincia da capo").
 */
export async function prendiOAggiornaLock(
  archivio: ArchivioLock,
  p: { token: string; origine: OrigineRicalcolo; avanzamento: Avanzamento; nuovoAvvio?: boolean; ora?: number; avviatoDa?: string | null },
): Promise<StatoLock> {
  const ora = p.ora ?? Date.now();
  const oraIso = new Date(ora).toISOString();
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const riga = await archivio.leggi();
    const attuale = riga ? leggiStatoLock(riga.valore) : null;
    const mio = attuale?.token === p.token;
    const stato: StatoLock = {
      token: p.token,
      origine: p.origine,
      avviato_at: mio && !p.nuovoAvvio && attuale ? attuale.avviato_at : oraIso,
      ...p.avanzamento,
      avviato_da: p.avviatoDa ?? (mio && attuale ? attuale.avviato_da ?? null : null),
    };
    const valore = JSON.stringify(stato);
    if (!riga) {
      if (await archivio.inserisci(valore, oraIso)) return stato;
      continue;
    }
    if (mio) {
      if (await archivio.aggiornaSeToken(valore, oraIso, p.token)) return stato;
      continue;
    }
    if (!lockScaduto(riga, ora) && attuale) throw new ErroreRicalcoloInCorso(attuale);
    if (await archivio.sostituisciSe(valore, oraIso, riga.updated_at)) return stato;
  }
  const riga = await archivio.leggi();
  const attuale = riga ? leggiStatoLock(riga.valore) : null;
  if (attuale) throw new ErroreRicalcoloInCorso(attuale);
  throw new Error("Impossibile prendere il lock del ricalcolo: riprova.");
}

export async function rilasciaLock(archivio: ArchivioLock, token: string): Promise<void> {
  await archivio.eliminaSeToken(token);
}
