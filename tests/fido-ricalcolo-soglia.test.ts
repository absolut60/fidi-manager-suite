import { test, expect } from "bun:test";
import { SCADENZA_LOCK_MS, barraRicalcolo, lockScaduto, ricalcoloAttivo } from "../src/lib/fido-teorico-ricalcolo-lock";

const ORA = Date.parse("2026-11-02T12:00:00Z");
const valore = JSON.stringify({ token: "t", origine: "manuale", avviato_at: "2026-11-02T11:50:00Z", fase: "blocchi", blocco: 5, previsti: 65, avviato_da: "Andrea Giani" });
const riga = (msFa: number) => ({ valore, updated_at: new Date(ORA - msFa).toISOString() });

test("soglia interrotto: 3 minuti senza aggiornamenti del lock", () => {
  expect(SCADENZA_LOCK_MS).toBe(3 * 60 * 1000);
});

test("2 minuti e 59 secondi: ricalcolo ancora attivo", () => {
  const r = riga(179_000);
  expect(lockScaduto(r, ORA)).toBe(false);
  expect(ricalcoloAttivo(r, ORA)?.avviato_da).toBe("Andrea Giani");
  expect(barraRicalcolo(r, ORA)?.tipo).toBe("attivo");
});

test("oltre 3 minuti: interrotto e lock riprendibile", () => {
  const r = riga(181_000);
  expect(lockScaduto(r, ORA)).toBe(true);
  expect(ricalcoloAttivo(r, ORA)).toBeNull();
  const b = barraRicalcolo(r, ORA);
  expect(b?.tipo).toBe("interrotto");
  if (b?.tipo === "interrotto") expect(b.testo).toMatch(/^Ricalcolo interrotto alle \d{2}:\d{2}: puoi rilanciarlo$/);
});
