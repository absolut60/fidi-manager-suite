import { expect, it } from "bun:test";
import { calcolaBlocco, type Riga } from "@/lib/preventivi-api";
import { margineTotaliRighe } from "@/lib/riga-preventivo";

it("PRV-161 margine del blocco e gruppo escluso anche con valori residui", () => {
  const righe = [
    { id: "lastra", tipo_riga: "articolo_singolo", articolo_codice: "FASL00H003300A0", quantita: 40, prezzo_unit: 4.167, sconti_gamma: [10], costo: 120.4, vendita: 0, peso_gamma_unit: null },
    { id: "strati", tipo_riga: "da_kit", articolo_id: null, articolo_codice: null, quantita: 10, prezzo_unit: 100, costo: 200 },
  ] as unknown as Riga[];
  const b = calcolaBlocco(righe);
  expect(b.totale).toBe(150.01);
  expect(b.costo).toBe(120.4);
  expect(Number(margineTotaliRighe(b).perc.toFixed(1))).toBe(19.7);
  expect(b.righe[1].calc.importoEffettivo).toBe(0);
});

it("peso Gamma segue quantità invece del peso salvato senza alterare importi", () => {
  const b = calcolaBlocco([{ id: "a", tipo_riga: "articolo_singolo", articolo_codice: "a", quantita: 40, prezzo_unit: 4.167, sconti_gamma: [10], costo: 120.4, peso: 1, peso_gamma_unit: 8.7 }] as unknown as Riga[]);
  expect(b.peso).toBe(348);
  expect(b.totale).toBe(150.01);
});