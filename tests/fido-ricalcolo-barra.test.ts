import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SCADENZA_LOCK_MS, barraRicalcolo, percentualeRicalcolo, type StatoLock } from "../src/lib/fido-teorico-ricalcolo-lock";

const ORA = Date.parse("2026-11-02T10:00:00Z");
const base: StatoLock = { token: "t", origine: "automatico", avviato_at: "2026-11-02T09:44:00Z", fase: "blocchi", blocco: 23, previsti: 65 };
const riga = (s: Partial<StatoLock>, aggiornato = ORA - 5_000) => ({
  valore: JSON.stringify({ ...base, ...s }), updated_at: new Date(aggiornato).toISOString(),
});

describe("barra ricalcolo fido teorico", () => {
  test("blocco 23 di 65 = 35%", () => {
    const b = barraRicalcolo(riga({}), ORA);
    expect(b?.tipo).toBe("attivo");
    if (b?.tipo !== "attivo") return;
    expect(b.etichetta).toBe("Blocco 23 di 65 · 35%");
    expect(b.titolo).toBe("Ricalcolo del fido teorico in corso (automatico)");
    expect(b.avviatoAlle).toBe("Avviato alle 10:44");
    expect(b.compatto).toBe("Ricalcolo in corso · 35% — i fidi consigliati si stanno aggiornando");
  });
  test("avviato da un utente", () => {
    const b = barraRicalcolo(riga({ origine: "manuale", avviato_da: "Mario Rossi" }), ORA);
    expect(b?.tipo === "attivo" && b.titolo).toBe("Ricalcolo del fido teorico in corso (avviato da Mario Rossi)");
  });
  test("fasi finali", () => {
    expect(barraRicalcolo(riga({ fase: "chiusura" }), ORA)).toMatchObject({ etichetta: "Chiusura · 96%" });
    expect(barraRicalcolo(riga({ fase: "alert" }), ORA)).toMatchObject({ etichetta: "Aggiornamento alert · 98%" });
    expect(barraRicalcolo(riga({ fase: "avvisi" }), ORA)).toMatchObject({ etichetta: "Invio avvisi · 99%" });
  });
  test("ultimo blocco non supera il 95%", () => {
    expect(percentualeRicalcolo({ ...base, blocco: 65 })).toBe(95);
  });
  test("lock scaduto: niente barra, avviso interrotto", () => {
    const agg = ORA - SCADENZA_LOCK_MS - 1_000;
    const b = barraRicalcolo(riga({}, agg), ORA);
    expect(b).toEqual({ tipo: "interrotto", testo: `Ricalcolo interrotto alle ${new Date(agg).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}: puoi rilanciarlo` });
  });
  test("nessun lock: niente", () => {
    expect(barraRicalcolo(null, ORA)).toBeNull();
  });
  test("job automatico rinnova il lock anche negli avvisi", () => {
    const job = readFileSync("src/lib/inngest/fido-teorico-ricalcolo.server.ts", "utf8");
    expect(job).toContain("passoNotificheAlertFidi(lock)");
    const passi = readFileSync("src/lib/fido-teorico-ricalcolo-passi.server.ts", "utf8");
    expect(passi).toContain('fase: "avvisi"');
    expect(passi).toContain('fase: "alert"');
  });
});
