import { expect, test } from "bun:test";
import { formatoDistanzaCantiere, linkIndicazioniCantiere, nomeSedeBreve } from "../src/lib/cantiere-distanza";
test("nome sede breve solo per visualizzazione", () => {
  expect(nomeSedeBreve("SEDE DI CINISELLO BALSAMO")).toBe("Cinisello Balsamo");
  expect(nomeSedeBreve(" SEDE DI CASOREZZO ")).toBe("Casorezzo");
  expect(nomeSedeBreve("EMPOLI")).toBe("Empoli");
});
test("329.3 km e 202 minuti: una decimale italiana e ore/minuti", () => {
  expect(formatoDistanzaCantiere(329.3, 202)).toBe("329,3 km · 3 h 22 min");
});
test("45 minuti senza ore", () => {
  expect(formatoDistanzaCantiere(12, 45)).toBe("12,0 km · 45 min");
});
test("indicazioni dalla sede al cantiere, anche coordinate zero", () => {
  const url = new URL(linkIndicazioniCantiere({ lat: 43.7, lng: 10.9 }, { lat: 0, lng: 0 }) ?? "");
  expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
  expect(url.searchParams.get("origin")).toBe("0,0");
  expect(url.searchParams.get("destination")).toBe("43.7,10.9");
});
test("nessun link senza posizione", () => {
  expect(linkIndicazioniCantiere({ lat: null, lng: null })).toBeNull();
});