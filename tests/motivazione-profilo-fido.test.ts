import { describe, expect, test } from "bun:test";
import { MOTIVAZIONE_PROFILO_FIDO } from "../src/lib/fido-teorico";

describe("MOTIVAZIONE_PROFILO_FIDO", () => {
  test("perso", () => expect(MOTIVAZIONE_PROFILO_FIDO.perso).toBe("Cliente perso: nessun acquisto da oltre 18 mesi"));
  test("mai_acquistato", () => expect(MOTIVAZIONE_PROFILO_FIDO.mai_acquistato).toBe("Cliente mai acquistato: fido non utilizzato"));
  test("dormiente", () => expect(MOTIVAZIONE_PROFILO_FIDO.dormiente).toBe("Cliente dormiente: fido ridotto al minimo di 500 €"));
  test("altri profili ereditano la generale", () => expect(MOTIVAZIONE_PROFILO_FIDO.puntuale).toBeUndefined());
});
