import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inclusoInizialeProposta } from "@/lib/proposta-fido-visibilita";
import { AVVISO_FIDO_ZERO, etichettaRigaProposta, fraseBreveProposta, mostraAvvisoFidoZero } from "@/lib/proposta-fido-riga";

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

describe("FM55 fetta 5 — avviso fido a zero", () => {
  test("testo esatto", () => {
    expect(AVVISO_FIDO_ZERO).toBe("Con fido a zero il cliente resta bloccato: solo pagamento alla consegna.");
  });
  test("compare con 0 proposto dal sistema e con 0 scritto a mano", () => {
    expect(mostraAvvisoFidoZero({ valore: 0, fidoAttuale: 2000, regola: "scaduto_non_incassato" })).toBe(true);
    // utente che scrive 0 a mano su un aumento
    expect(mostraAvvisoFidoZero({ valore: Number("0"), fidoAttuale: 15000, regola: "calcolo" })).toBe(true);
  });
  test("non compare per bloccati/legali, fido attuale 0 o valore > 0", () => {
    expect(mostraAvvisoFidoZero({ valore: 0, fidoAttuale: 2000, regola: "cliente_bloccato" })).toBe(false);
    expect(mostraAvvisoFidoZero({ valore: 0, fidoAttuale: 2000, regola: "gestione_legale" })).toBe(false);
    expect(mostraAvvisoFidoZero({ valore: 0, fidoAttuale: 0, regola: "calcolo" })).toBe(false);
    expect(mostraAvvisoFidoZero({ valore: 500, fidoAttuale: 2000, regola: "calcolo" })).toBe(false);
  });
});

describe("FM55 fetta 5 — riga semplice", () => {
  test("una sola etichetta, la rossa vince", () => {
    expect(etichettaRigaProposta(["oltre_normale", "ordini_oltre_fido"])).toEqual({ tono: "rossa", testo: "Da autorizzare" });
    expect(etichettaRigaProposta(["ordini_oltre_fido"])).toEqual({ tono: "arancione", testo: "Ordini oltre il fido" });
    expect(etichettaRigaProposta([])).toBeNull();
  });
  test("frasi brevi", () => {
    expect(fraseBreveProposta({ regola_applicata: "scaduto_non_incassato", scaduto_oltre: 1566, scaduto_oltre_giorni: 32 }, 2000, 0))
      .toBe("Scaduto non pagato 1.566 € da 32 giorni: fido a zero finché non rientra.");
    expect(fraseBreveProposta({ regola_applicata: "calcolo", acquisto_mensile: 13200, ciclo_gg: 77 }, 10000, 40000))
      .toBe("Compra in media 13.200 € al mese e paga in circa 77 giorni.");
    expect(fraseBreveProposta({ regola_applicata: "calcolo", acquisto_mensile: 1000, ciclo_gg: 30,
      spiegazione: "Compra in media 1.000 €. Negli ultimi 30 giorni è arrivato a doverci 4.000 €: per non bloccarlo il fido non scende sotto 5.000 €." }, 8000, 5000))
      .toBe("Negli ultimi 30 giorni è arrivato a doverci 4.000 €: per non bloccarlo il fido non scende sotto 5.000 €.");
  });
  test("la riga non contiene più 'Teorico:' né 'Da verificare'", () => {
    const dialog = readFileSync("src/components/proposta-fido-massiva-dialog.tsx", "utf8");
    expect(dialog).not.toContain("Teorico:");
    expect(dialog).not.toContain("Da verificare");
    const campo = readFileSync("src/components/extra-fido-teorico.tsx", "utf8");
    expect(campo).toContain("{!compatto && <p");
  });
});
