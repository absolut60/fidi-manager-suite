import { expect, test } from "bun:test";
import { normalizzaIndirizzo, residenzaDaIndirizzo } from "../src/lib/blocco-indirizzo";
test("Provincia sempre in maiuscolo", () => {
  expect(normalizzaIndirizzo({ provincia: "fi" })).toEqual({ provincia: "FI" });
});
test("Sede conserva il limite provincia di due caratteri", () => {
  expect(normalizzaIndirizzo({ provincia: "firenze" }, { provincia: 2 })).toEqual({ provincia: "FI" });
});
test("Lead conserva i limiti 200/10/100/5 anche sui suggerimenti", () => {
  const r = normalizzaIndirizzo({ indirizzo: "a".repeat(201), cap: "1".repeat(11), citta: "a".repeat(101), provincia: "abcdef" }, { indirizzo: 200, cap: 10, citta: 100, provincia: 5 });
  expect(r.indirizzo?.length).toBe(200); expect(r.cap?.length).toBe(10); expect(r.citta?.length).toBe(100); expect(r.provincia).toBe("ABCDE");
});
test("Le modifiche parziali non sovrascrivono gli altri campi", () => {
  expect(normalizzaIndirizzo({ citta: "Empoli" })).toEqual({ citta: "Empoli" });
});
test("La residenza unica include via, CAP, città e provincia senza nuovi campi salvati", () => {
  expect(residenzaDaIndirizzo({ indirizzo: "Via Roma 45", cap: "50053", citta: "Empoli", provincia: "fi" })).toBe("Via Roma 45 50053 Empoli (FI)");
});
test("La residenza unica non inventa parti assenti", () => {
  expect(residenzaDaIndirizzo({ indirizzo: "Via Roma 45", cap: "", citta: "", provincia: "" })).toBe("Via Roma 45");
});
test("La residenza unica rispetta il limite esistente di 200 caratteri", () => {
  const indirizzo = residenzaDaIndirizzo({ indirizzo: "a".repeat(195), cap: "50053", citta: "Empoli", provincia: "fi" });
  expect(normalizzaIndirizzo({ indirizzo }, { indirizzo: 200 }).indirizzo).toBe("a".repeat(195) + " 5005");
});