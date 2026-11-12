import { describe, expect, test } from "bun:test";
import { ORDINE_LISTINI_ARTICOLO, patchTecniciArticolo } from "../src/lib/scheda-articolo";
import { totaleDisponibilitaArticolo, ordinaFornitoriArticolo, contaPreventiviArticolo, type RigaDisponibilitaArticolo } from "../src/lib/scheda-articolo";

describe("scheda articolo — confine dati tecnici", () => {
  test("salva soltanto gli otto campi Sistema MADE, mai Gamma o prezzi", () => {
    const input = { categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa", descrizione: "Non scrivere", cod_gamma: "AKINAF01007", stato: "potenziale" };
    expect(patchTecniciArticolo(input)).toEqual({ categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa" });
  });
  test("campi vuoti restano null e quantità zero resta zero", () => {
    expect(patchTecniciArticolo({ qta_cliente: 0 })).toEqual({ categoria: null, tipologia: null, componente: null, qta_cliente: 0, qta_fornitore: null, peso_unit: null, note_acquisto: null, note: null });
  });
  test("ordine sedi Gamma: 10, 20, 30, 9", () => {
    expect([...ORDINE_LISTINI_ARTICOLO]).toEqual([10, 20, 30, 9]);
  });
});

describe("scheda articolo — letture fetta C", () => {
  const riga = (livello: string, disponibilita: number): RigaDisponibilitaArticolo => ({ livello, disponibilita, nome: "Prova", store_id: "", deposito_codice: "", conta_disponibilita: "si", giacenza: disponibilita, impegnato_clienti: 0, ordinato_fornitori: 0 });
  test("ALP46142 totale 3612, logistica 936 separata; depositi mai contati due volte", () => {
    const sedi = [198, 1164, 52, 156, 519, 462, 125];
    expect(totaleDisponibilitaArticolo([...sedi.map((n) => riga("sede", n)), riga("logistica_comune", 936), ...sedi.map((n) => riga("deposito", n)), riga("deposito", 936), riga("deposito", 999)])).toBe(3612);
  });
  test("FASL00H003300A0 conserva disponibilità negativa e totale 3358,8", () => {
    expect(totaleDisponibilitaArticolo([-118.8, 212.4, 3265.2].map((n) => riga("sede", n)))).toBeCloseTo(3358.8, 6);
  });
  test("fornitori: preferenziale prima, poi nome; conserva codici diversi dello stesso fornitore", () => {
    const rows = [ { preferenziale: false, fornitore: { ragione_sociale: "Zeta" }, codice_articolo_fornitore: "2" }, { preferenziale: false, fornitore: { ragione_sociale: "Alfa" }, codice_articolo_fornitore: "3" }, { preferenziale: true, fornitore: { ragione_sociale: "Zeta" }, codice_articolo_fornitore: "1" } ];
    expect(ordinaFornitoriArticolo(rows).map((r) => r.codice_articolo_fornitore)).toEqual(["1", "3", "2"]);
    expect(rows[0].codice_articolo_fornitore).toBe("2");
  });
  test("preventivi distinti attraverso blocchi, non numero di righe", () => {
    expect(contaPreventiviArticolo([{ blocchi_preventivo: { preventivo_id: "uno" } }, { blocchi_preventivo: { preventivo_id: "uno" } }, { blocchi_preventivo: { preventivo_id: "due" } }, { blocchi_preventivo: null }])).toBe(2);
  });
});