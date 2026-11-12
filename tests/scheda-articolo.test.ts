import { describe, expect, test } from "bun:test";
import { patchTecniciArticolo, numeroAcquistoArticolo, listiniVisibiliArticolo, venditaInEvidenza, type RigaListinoArticolo } from "../src/lib/scheda-articolo";
import { prezzoArticolo } from "../src/lib/catalogo-articoli";
import { giacenzeArticolo, ordinaFornitoriArticolo, contaPreventiviArticolo, type RigaDisponibilitaArticolo } from "../src/lib/scheda-articolo";

describe("scheda articolo — confine dati tecnici", () => {
  test("salva soltanto gli otto campi Sistema MADE, mai Gamma o prezzi", () => {
    const input = { categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa", descrizione: "Non scrivere", cod_gamma: "AKINAF01007", stato: "potenziale" };
    expect(patchTecniciArticolo(input)).toEqual({ categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa" });
  });
  test("campi vuoti restano null e quantità zero resta zero", () => {
    expect(patchTecniciArticolo({ qta_cliente: 0 })).toEqual({ categoria: null, tipologia: null, componente: null, qta_cliente: 0, qta_fornitore: null, peso_unit: null, note_acquisto: null, note: null });
  });
  test("prezzi in euro sempre a 4 decimali; quantità invariate", () => {
    expect(prezzoArticolo(5.565)).toBe("5,5650\u00a0€");
    expect(prezzoArticolo(4.8)).toBe("4,8000\u00a0€");
    expect(numeroAcquistoArticolo(3.975, true)).toBe("3,9750 €");
    expect(numeroAcquistoArticolo(12.5)).toBe("12,5");
  });
});

describe("scheda articolo — letture fetta C", () => {
  const riga = (livello: string, disponibilita: number): RigaDisponibilitaArticolo => ({ livello, disponibilita, nome: "Prova", store_id: "", deposito_codice: "", conta_disponibilita: "si", giacenza: disponibilita, impegnato_clienti: 0, ordinato_fornitori: 0 });
  const conGiacenza = (livello: string, giacenza: number, store_id = ""): RigaDisponibilitaArticolo => ({ ...riga(livello, 0), giacenza, store_id });
  test("giacenza: utente globale somma le sedi, logistica separata e depositi mai contati", () => {
    const g = giacenzeArticolo([conGiacenza("sede", 10, "a"), conGiacenza("sede", 5, "b"), conGiacenza("logistica_comune", 15), conGiacenza("deposito", 999, "a")], null);
    expect(g.sede).toBe(15);
    expect(g.logistica).toBe(15);
  });
  test("giacenza: utente di sede vede la sua sede, elencata per prima", () => {
    const g = giacenzeArticolo([conGiacenza("sede", 50, "a"), conGiacenza("sede", 3, "b"), conGiacenza("logistica_comune", 15)], "b");
    expect(g.sede).toBe(3);
    expect(g.sedi.map((r) => r.store_id)).toEqual(["b", "a"]);
    expect(g.logistica).toBe(15);
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
describe("scheda articolo — listini per sede (FM63)", () => {
  const r = (listino: number, store_id: string | null, fonte: string, prezzo: number) => ({ listino, listino_descrizione: "L", store_id, sede_nome: store_id, deposito_codice: store_id ? "CA" : null, prezzo_listino: 5.565, prezzo_deposito: fonte === "deposito" ? prezzo : null, prezzo, fonte } as unknown as RigaListinoArticolo);
  test("utente globale: in evidenza la base L10, depositi elencati a parte", () => {
    const g = listiniVisibiliArticolo([r(10, null, "listino", 5.565), r(10, "cambiago", "deposito", 4.8), r(20, null, "listino", 5.565)], true);
    expect(g.map((x) => x.listino)).toEqual([10, 20]);
    expect(venditaInEvidenza(g, true)?.principale.prezzo).toBe(5.565);
    expect(g[0].depositi.map((d) => d.prezzo)).toEqual([4.8]);
  });
  test("utente di sede: una sola riga, prezzo per deposito già scelto dal database", () => {
    const g = listiniVisibiliArticolo([r(10, "cambiago", "deposito", 4.8)], false);
    expect(venditaInEvidenza(g, false)?.principale.prezzo).toBe(4.8);
    expect(g[0].depositi).toEqual([]);
  });
});
