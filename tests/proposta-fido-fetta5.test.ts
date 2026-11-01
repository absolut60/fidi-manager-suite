import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inclusoInizialeProposta } from "@/lib/proposta-fido-visibilita";
import { etichettaRigaProposta } from "@/lib/proposta-fido-riga";

describe("FM55 fetta 5 — spunta iniziale", () => {
  test("scaduto non incassato a zero da fido > 0: non spuntata (anche se non rossa)", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: false, regola: "scaduto_non_incassato", fidoAttuale: 2000, fidoProposto: 0 })).toBe(false);
    expect(inclusoInizialeProposta({ proponibile: true, rossa: false, regola: "calcolo", fidoAttuale: 2000, fidoProposto: 0, segnalazioni: ["scaduto_non_incassato"] })).toBe(false);
  });
  test("bloccati e legali ridotti a zero restano spuntati", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "cliente_bloccato", fidoAttuale: 5000, fidoProposto: 0, segnalazioni: ["scaduto_non_incassato"] })).toBe(true);
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "gestione_legale", fidoAttuale: 3000, fidoProposto: 0 })).toBe(true);
  });
  test("resto invariato: oltre_normale rosso non spuntato, aumento normale spuntato", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "calcolo", fidoAttuale: 10000, fidoProposto: 20000, segnalazioni: ["oltre_normale"] })).toBe(false);
    expect(inclusoInizialeProposta({ proponibile: true, rossa: false, regola: "calcolo", fidoAttuale: 10000, fidoProposto: 20000 })).toBe(true);
  });
});

describe("FM55 fetta 5 — riga semplice", () => {
  test("una sola etichetta, decisa dal motivo vincente", () => {
    expect(etichettaRigaProposta({ regola: "calcolo", segnalazioni: ["oltre_normale", "ordini_oltre_fido"] })).toEqual({ tono: "viola", testo: "Da autorizzare: compra molto più del solito" });
    expect(etichettaRigaProposta({ regola: "calcolo", segnalazioni: ["ordini_oltre_fido"] })).toEqual({ tono: "azzurra", testo: "Ordini oltre il fido" });
    expect(etichettaRigaProposta({ regola: "calcolo", segnalazioni: [] })).toBeNull();
  });
  test("la riga non contiene più 'Teorico:' né 'Da verificare'", () => {
    const dialog = readFileSync("src/components/proposta-fido-massiva-dialog.tsx", "utf8");
    expect(dialog).not.toContain("Teorico:");
    expect(dialog).not.toContain("Da verificare");
    const campo = readFileSync("src/components/extra-fido-teorico.tsx", "utf8");
    expect(campo).toContain("{!compatto && <p");
  });
});
