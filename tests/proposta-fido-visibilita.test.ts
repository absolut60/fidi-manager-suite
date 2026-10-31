import { describe, expect, it } from "vitest";
import { righeVisibiliProposta } from "@/lib/proposta-fido-visibilita";

const filtri = { tipi: ["nuovo_fido", "aumento", "diminuzione"], pagImmediato: "tutti", fidoZero: "tutti", inCorso: "tutti" };

describe("visibilità proposta massiva", () => {
  it("riga diminuzione portata a rinnovo resta visibile se toccata", () => {
    const riga = { cliente_id: "a", tipo: "rinnovo", regola: "calcolo", fido_proposto: 10000 };
    expect(righeVisibiliProposta([riga], filtri, new Set(["a"]))).toHaveLength(1);
  });
  it("dopo un cambio filtro (toccate svuotate) la riga rinnovo sparisce", () => {
    const riga = { cliente_id: "a", tipo: "rinnovo", regola: "calcolo", fido_proposto: 10000 };
    expect(righeVisibiliProposta([riga], { ...filtri }, new Set())).toHaveLength(0);
  });
});
