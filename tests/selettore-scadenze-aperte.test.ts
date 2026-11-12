import { describe, expect, test } from "bun:test";
import {
  accontoSuScadenzaAperta,
  scadenzaSelezionabile,
} from "../src/components/selettore-scadenze-aperte";

describe("FM62 selettore scadenze: regola di selezionabilità", () => {
  test("riga con acconto su partita Aperta è selezionabile (EDIL GESSO 3274/RF)", () => {
    const riga = {
      numero_documento: "3274/RF",
      stato_contabile: "Aperta",
      importo_scadenza: 7220.43,
      importo_pagato: 1500,
      data_pagamento_effettiva: "2026-10-29",
      tempi_scadenza_key: "Aperte",
    };
    expect(scadenzaSelezionabile(riga)).toBe(true);
    // L'importo da collegare resta il residuo (importo_scadenza).
    expect(riga.importo_scadenza).toBe(7220.43);
    expect(accontoSuScadenzaAperta(riga)).toEqual({ importo: 1500, data: "2026-10-29" });
  });

  test("riga chiusa in anticipo da Gamma resta esclusa", () => {
    const riga = {
      stato_contabile: "Chiusa",
      data_pagamento_effettiva: null,
      tempi_scadenza_key: "Pagate",
      importo_pagato: 3200,
      importo_scadenza: 3200,
    };
    expect(scadenzaSelezionabile(riga)).toBe(false);
    expect(accontoSuScadenzaAperta(riga)).toBeNull();
  });

  test("riga normale senza pagamenti è selezionabile e senza badge acconto", () => {
    const riga = {
      stato_contabile: "Aperta",
      data_pagamento_effettiva: null,
      importo_pagato: 0,
      importo_scadenza: 1200,
    };
    expect(scadenzaSelezionabile(riga)).toBe(true);
    expect(accontoSuScadenzaAperta(riga)).toBeNull();
  });

  test("riga incassata per intero (Chiusa con data pagamento) resta esclusa", () => {
    const riga = {
      stato_contabile: "Chiusa",
      data_pagamento_effettiva: "2026-10-01",
      importo_pagato: 900,
      importo_scadenza: 900,
    };
    expect(scadenzaSelezionabile(riga)).toBe(false);
    expect(accontoSuScadenzaAperta(riga)).toBeNull();
  });

  test("partita tecnica a zero non è selezionabile", () => {
    expect(
      scadenzaSelezionabile({
        stato_contabile: "Aperta",
        data_pagamento_effettiva: null,
        importo_scadenza: 0,
      }),
    ).toBe(false);
  });

  test("RiBa presentata non incassata (Chiusa senza data) è selezionabile come prima", () => {
    const riga = {
      stato_contabile: "Chiusa",
      data_pagamento_effettiva: null,
      tempi_scadenza_key: "Presentate",
      importo_pagato: 0,
      importo_scadenza: 5000,
    };
    expect(scadenzaSelezionabile(riga)).toBe(true);
    expect(accontoSuScadenzaAperta(riga)).toBeNull();
  });

  test("acconto su Aperta senza quota pagata: selezionabile, nessun badge", () => {
    const riga = {
      stato_contabile: "Aperta",
      data_pagamento_effettiva: "2026-10-29",
      importo_pagato: 0,
      importo_scadenza: 800,
    };
    expect(scadenzaSelezionabile(riga)).toBe(true);
    expect(accontoSuScadenzaAperta(riga)).toBeNull();
  });
});
