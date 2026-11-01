import { describe, expect, test } from "bun:test";
import {
  ErroreRicalcoloInCorso,
  SCADENZA_LOCK_MS,
  prendiOAggiornaLock,
  ricalcoloAttivo,
  rilasciaLock,
  testoRicalcoloInCorso,
  type ArchivioLock,
  type RigaLock,
} from "../src/lib/fido-teorico-ricalcolo-lock";

function archivioMemoria() {
  let riga: RigaLock | null = null;
  const a: ArchivioLock = {
    leggi: async () => (riga ? { ...riga } : null),
    inserisci: async (valore, ora) => {
      if (riga) return false;
      riga = { valore, updated_at: ora };
      return true;
    },
    sostituisciSe: async (valore, ora, letto) => {
      if (!riga || riga.updated_at !== letto) return false;
      riga = { valore, updated_at: ora };
      return true;
    },
    aggiornaSeToken: async (valore, ora, token) => {
      if (!riga || !riga.valore.includes(`"token":"${token}"`)) return false;
      riga = { valore, updated_at: ora };
      return true;
    },
    eliminaSeToken: async (token) => {
      if (riga?.valore.includes(`"token":"${token}"`)) riga = null;
    },
  };
  return { a, riga: () => riga };
}

const T0 = Date.parse("2026-11-01T16:40:00Z");
const prep = { fase: "preparazione" as const, blocco: null, previsti: null };

describe("lock ricalcolo fido teorico", () => {
  test("lock preso → secondo avvio rifiutato con messaggio", async () => {
    const { a } = archivioMemoria();
    await prendiOAggiornaLock(a, { token: "job", origine: "automatico", avanzamento: prep, nuovoAvvio: true, ora: T0 });
    const err = await prendiOAggiornaLock(a, {
      token: "pulsante", origine: "manuale", avanzamento: prep, nuovoAvvio: true, ora: T0 + 60_000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ErroreRicalcoloInCorso);
    expect(err.message).toBe("Ricalcolo già in corso (avviato alle 17:40, automatico): attendi");
  });

  test("lock scaduto dopo 15 minuti senza avanzamento → riparte", async () => {
    const { a, riga } = archivioMemoria();
    await prendiOAggiornaLock(a, { token: "job", origine: "automatico", avanzamento: prep, nuovoAvvio: true, ora: T0 });
    const s = await prendiOAggiornaLock(a, {
      token: "pulsante", origine: "manuale", avanzamento: prep, nuovoAvvio: true, ora: T0 + SCADENZA_LOCK_MS + 1,
    });
    expect(s.token).toBe("pulsante");
    expect(riga()!.valore).toContain('"token":"pulsante"');
  });

  test("il battito a ogni blocco tiene vivo il lock oltre 15 minuti", async () => {
    const { a } = archivioMemoria();
    await prendiOAggiornaLock(a, { token: "job", origine: "automatico", avanzamento: prep, nuovoAvvio: true, ora: T0 });
    await prendiOAggiornaLock(a, {
      token: "job", origine: "automatico", avanzamento: { fase: "blocchi", blocco: 9, previsti: 65 }, ora: T0 + 10 * 60_000,
    });
    const err = await prendiOAggiornaLock(a, {
      token: "pulsante", origine: "manuale", avanzamento: prep, nuovoAvvio: true, ora: T0 + 20 * 60_000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ErroreRicalcoloInCorso);
    expect(err.stato.blocco).toBe(9);
  });

  test("ripresa con lo stesso token consentita, rilascio libera il lock", async () => {
    const { a, riga } = archivioMemoria();
    await prendiOAggiornaLock(a, { token: "p", origine: "manuale", avanzamento: prep, nuovoAvvio: true, ora: T0 });
    const s = await prendiOAggiornaLock(a, {
      token: "p", origine: "manuale", avanzamento: { fase: "blocchi", blocco: 14, previsti: 65 }, ora: T0 + 1000,
    });
    expect(s.avviato_at).toBe(new Date(T0).toISOString());
    await rilasciaLock(a, "altro");
    expect(riga()).not.toBeNull();
    await rilasciaLock(a, "p");
    expect(riga()).toBeNull();
  });

  test("la pagina vede il ricalcolo attivo solo se il lock non è scaduto", () => {
    const valore = JSON.stringify({ token: "j", origine: "automatico", avviato_at: "2026-11-01T16:40:00Z", fase: "blocchi", blocco: 3, previsti: 65 });
    const r = { valore, updated_at: "2026-11-01T16:45:00Z" };
    const s = ricalcoloAttivo(r, Date.parse("2026-11-01T16:50:00Z"));
    expect(s && testoRicalcoloInCorso(s)).toBe("Ricalcolo già in corso (avviato alle 17:40, automatico): attendi");
    expect(ricalcoloAttivo(r, Date.parse("2026-11-01T17:01:00Z"))).toBeNull();
  });
});
