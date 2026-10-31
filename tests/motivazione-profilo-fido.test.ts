import { describe, expect, test } from "bun:test";
import { MOTIVAZIONE_PROFILO_FIDO } from "../src/lib/fido-teorico";
import { motivazioneEffettiva } from "../src/lib/motivazione-proposta";

describe("MOTIVAZIONE_PROFILO_FIDO", () => {
  test("perso", () => expect(MOTIVAZIONE_PROFILO_FIDO.perso).toBe("Cliente perso: nessun acquisto da oltre 18 mesi"));
  test("mai_acquistato", () => expect(MOTIVAZIONE_PROFILO_FIDO.mai_acquistato).toBe("Cliente mai acquistato: fido non utilizzato"));
  test("dormiente", () => expect(MOTIVAZIONE_PROFILO_FIDO.dormiente).toBe("Cliente dormiente: fido ridotto al minimo di 500 €"));
  test("altri profili ereditano la generale", () => expect(MOTIVAZIONE_PROFILO_FIDO.puntuale).toBeUndefined());
});

describe("motivazioneEffettiva", () => {
  const GENERALE = "Revisione fido massiva";
  const AUTO = MOTIVAZIONE_PROFILO_FIDO.mai_acquistato;
  const base = { motivazione_auto: AUTO, fido_proposto: 0, fido_iniziale: 0 };

  test("riga non modificata: usa la motivazione automatica dal profilo", () =>
    expect(motivazioneEffettiva(base, GENERALE)).toBe(AUTO));
  test("importo cambiato a mano: niente motivazione automatica, usa la generale", () =>
    expect(motivazioneEffettiva({ ...base, fido_proposto: 10_000 }, GENERALE)).toBe(GENERALE));
  test("importo cambiato a mano: usa la motivazione personalizzata se c'è", () =>
    expect(motivazioneEffettiva({ ...base, fido_proposto: 10_000, motivazione: "Riapertura cliente" }, GENERALE)).toBe("Riapertura cliente"));
  test("override esplicito vuoto = nessuna motivazione", () =>
    expect(motivazioneEffettiva({ ...base, motivazione: "" }, GENERALE)).toBeNull());
});
