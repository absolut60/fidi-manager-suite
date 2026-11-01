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
export const SCADENZA_LOCK_MS = 15 * 60 * 1000;

export type OrigineRicalcolo = "automatico" | "manuale";

export type StatoLock = {
  token: string;
  origine: OrigineRicalcolo;
  avviato_at: string;
  fase: "preparazione" | "blocchi" | "chiusura";
  blocco: number | null;
  previsti: number | null;
};

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
      fase: v.fase === "blocchi" || v.fase === "chiusura" ? v.fase : "preparazione",
      blocco: typeof v.blocco === "number" ? v.blocco : null,
      previsti: typeof v.previsti === "number" ? v.previsti : null,
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
  return s.fase === "chiusura" ? "chiusura" : "preparazione";
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
  p: { token: string; origine: OrigineRicalcolo; avanzamento: Avanzamento; nuovoAvvio?: boolean; ora?: number },
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
