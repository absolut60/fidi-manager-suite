import { describe, expect, it } from "bun:test";
import { personePrincipali, suggerimentiContattiEmail, testoConfermaScollega, nomeContatto } from "../src/lib/contatti-fornitore";
import { TAB_SCHEDA_FORNITORE } from "../src/lib/scheda-fornitore";
import { datiAttivitaFornitore } from "../src/lib/attivita-fornitore";

describe("contatti fornitore (FM62 G6)", () => {
  it("la tab Contatti viene subito dopo Anagrafica", () => {
    expect(TAB_SCHEDA_FORNITORE.indexOf("contatti")).toBe(TAB_SCHEDA_FORNITORE.indexOf("anagrafica") + 1);
  });
  it("Riepilogo: al massimo 3 persone, principali prima", () => {
    const p = personePrincipali([{ id: "a", principale: false }, { id: "b", principale: true }, { id: "c" }, { id: "d", principale: true }], 3);
    expect(p.map(x => x.id)).toEqual(["b", "d", "a"]);
  });
  it("suggerimenti email: solo email valide, senza doppioni (maiuscole/spazi)", () => {
    const s = suggerimentiContattiEmail([
      { nome: "Mario", cognome: "Rossi", email: "Mario.Rossi@Fornitore.it" },
      { nome: "Doppio", email: " mario.rossi@fornitore.it " },
      { nome: "Senza", email: "non-valida" },
      { nome: "Anna", email: null },
    ]);
    expect(s).toEqual([{ etichetta: "Mario Rossi", valore: "Mario.Rossi@Fornitore.it" }]);
  });
  it("scollega: elimina solo chi è unicamente del fornitore", () => {
    expect(testoConfermaScollega({ cliente_id: null, lead_id: null })).toMatch(/eliminata/);
    expect(testoConfermaScollega({ cliente_id: "x", lead_id: null })).toMatch(/resta/);
    expect(testoConfermaScollega({ cliente_id: null, lead_id: "y" })).toMatch(/resta/);
  });
  it("nome di ripiego", () => expect(nomeContatto({ nome: " ", cognome: null })).toBe("Contatto"));
  it("attività: 'Con chi' facoltativo, solo uuid", () => {
    const base = { tipo: "telefonata" as const, dataAttivita: "2026-11-12T10:00:00.000Z" };
    expect(datiAttivitaFornitore.parse(base).contattoId).toBeUndefined();
    expect(datiAttivitaFornitore.parse({ ...base, contattoId: null }).contattoId).toBeNull();
    expect(() => datiAttivitaFornitore.parse({ ...base, contattoId: "abc" })).toThrow();
  });
});
