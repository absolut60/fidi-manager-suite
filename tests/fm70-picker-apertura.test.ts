import { describe, expect, test } from "bun:test";
import { inputArticoliAperturaPicker, parametriArticoliAperturaPicker } from "../src/lib/articoli-picker-apertura";

const cantiere = "11111111-1111-4111-8111-111111111111";
const sede = "22222222-2222-4222-8222-222222222222";
describe("FM70 apertura picker: parametri server", () => {
  test("opzionali assenti conservano i default RPC", () => {
    expect(parametriArticoliAperturaPicker(inputArticoliAperturaPicker.parse({}))).toEqual({});
  });
  test("cantiere e sede mappati singolarmente e insieme", () => {
    expect(parametriArticoliAperturaPicker(inputArticoliAperturaPicker.parse({ cantiere_id: cantiere }))).toEqual({ _cantiere_id: cantiere });
    expect(parametriArticoliAperturaPicker(inputArticoliAperturaPicker.parse({ sede_giacenza: sede }))).toEqual({ _sede_giacenza: sede });
    expect(parametriArticoliAperturaPicker(inputArticoliAperturaPicker.parse({ cantiere_id: cantiere, sede_giacenza: sede }))).toEqual({ _cantiere_id: cantiere, _sede_giacenza: sede });
  });
  test("UUID invalidi rifiutati prima della RPC", () => {
    expect(inputArticoliAperturaPicker.safeParse({ cantiere_id: "non-uuid" }).success).toBe(false);
    expect(inputArticoliAperturaPicker.safeParse({ sede_giacenza: "non-uuid" }).success).toBe(false);
  });
});