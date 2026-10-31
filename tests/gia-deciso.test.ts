import { describe, it, expect } from "bun:test";
import { giaDeciso, testoGiaDeciso, statoEffettivoAlert, contatoriAlert, alertSelezionabile, alertLasciabileCosi, filtraAlert, STATI_ALERT_DEFAULT, type AlertFidoRow, type DecisioneProtetta } from "@/lib/alert-fidi";

const dec: DecisioneProtetta = {
  richiesta_id: "r1", importo_approvato: 60000, fido_teorico_riferimento: 0, approvata_il: "2026-10-31T10:00:00Z",
  protetto_fino_al: "2026-11-30", scaduto_al_momento: 1200, scaduto_attuale: 1500, protezione_valida: true,
  tipo: "rinnovo", approvato_da_nome: "Andrea Giani",
};

describe("Già deciso – regola e frase", () => {
  it("giaDeciso vero solo con protezione valida e rif = Gamma", () => {
    expect(giaDeciso(dec, 60000, 60000)).toBe(true);
    expect(giaDeciso({ ...dec, protezione_valida: false }, 60000, 60000)).toBe(false);
    expect(giaDeciso(dec, 50000, 60000)).toBe(false);
    expect(giaDeciso(undefined, 60000, 60000)).toBe(false);
  });
  it("rinnovo con scaduto", () =>
    expect(testoGiaDeciso(dec)).toBe("Già deciso il 31/10 da Andrea Giani: fido confermato a 60.000 € anche con lo scaduto. Si riguarda dal 30/11."));
  it("aumento senza scaduto", () =>
    expect(testoGiaDeciso({ ...dec, tipo: "aumento", importo_approvato: 75000, scaduto_al_momento: 0 }))
      .toBe("Già deciso il 31/10 da Andrea Giani: portato a 75.000 €. Si riguarda dal 30/11."));
});

describe("Già deciso – Alert fidi", () => {
  const a = { id: "a1", cliente_id: "c1", tipo: "consumo", livello: 0.9, stato: "aperto", richiesta_attiva: null, gia_deciso: dec, cliente: null } as unknown as AlertFidoRow;
  it("stato effettivo gia_deciso, fuori dai default, contatori e bottoni", () => {
    expect(statoEffettivoAlert(a)).toBe("gia_deciso");
    expect(STATI_ALERT_DEFAULT).not.toContain("gia_deciso");
    expect(filtraAlert([a], { stati: STATI_ALERT_DEFAULT })).toHaveLength(0);
    expect(filtraAlert([a], { stati: ["gia_deciso"] })).toHaveLength(1);
    expect(contatoriAlert([a]).c90).toBe(0);
    expect(alertSelezionabile(a)).toBe(false);
    expect(alertLasciabileCosi(a)).toBe(false);
  });
});
