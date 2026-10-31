import { describe, expect, test } from "bun:test";
import { cosaFareAlert, alertLasciabileCosi } from "@/lib/alert-fidi";
import { formatEuro } from "@/lib/fidi";

describe("cosaFareAlert", () => {
  test("ACROBATICA MONZABRIANZA: scaduto prevale → prima incassare", () => {
    expect(cosaFareAlert({ fido_gamma: 3000 }, 3000, { segnalazioni: ["scaduto_non_incassato", "impegni_sopra_base"], scaduto_oltre: 958.65 }))
      .toBe(`Prima incassare: ${formatEuro(958.65)} scaduti`);
  });
  test("bloccato → nessun aumento", () => {
    expect(cosaFareAlert({ fido_gamma: 5000 }, 8000, { segnalazioni: ["bloccato", "uso_pieno"] })).toBe("Cliente bloccato: nessun aumento");
  });
  test("NUOVA EDIL 7162: impegni sopra base → compra oltre il normale", () => {
    expect(cosaFareAlert({ fido_gamma: 25000 }, 25000, { segnalazioni: ["impegni_sopra_base"] }))
      .toBe("Compra oltre il normale: il sistema non aumenta, decidi tu");
  });
  test("MM CONSTRUCTION 12694: riferimento 4.000 > fido 3.000 → aumento proposto", () => {
    expect(cosaFareAlert({ fido_gamma: 3000 }, 4000, { segnalazioni: ["uso_pieno"] })).toBe(`Aumento proposto a ${formatEuro(4000)}`);
  });
  test("riferimento uguale al fido → nessuna variazione", () => {
    expect(cosaFareAlert({ fido_gamma: 3000 }, 3000, { segnalazioni: ["uso_pieno"] })).toBe("Nessuna variazione proposta: valuta tu");
  });
  test("lascia così solo per consumo/extra aperti", () => {
    expect(alertLasciabileCosi({ tipo: "consumo", stato: "aperto" })).toBe(true);
    expect(alertLasciabileCosi({ tipo: "riduzione", stato: "aperto" })).toBe(false);
    expect(alertLasciabileCosi({ tipo: "consumo", stato: "confermato" })).toBe(false);
  });
});
