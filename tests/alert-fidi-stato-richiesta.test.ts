import { describe, expect, test } from "bun:test";
import { esitoRichiestaAlert, statoEffettivoAlert, alertSelezionabile, etichettaDecisioneAlert, type RichiestaClienteAlert } from "@/lib/alert-fidi";
import { formatEuro } from "@/lib/fidi";

const alert = { tipo: "consumo" as const, aperto_il: "2026-10-20T08:00:00Z", richiesta_id: null };
const ric = (x: Partial<RichiestaClienteAlert>): RichiestaClienteAlert => ({
  id: "r1", cliente_id: "c1", stato: "in_approvazione", stato_export: null, tipo: "aumento",
  importo_richiesto: 20000, created_at: "2026-10-31T09:00:00Z", data_processata: null, ...x,
});

describe("stato richiesta degli Alert fidi", () => {
  test("richiesta attiva → proposta inoltrata, anche se creata prima dell'apertura", () => {
    const e = esitoRichiestaAlert(alert, [ric({ created_at: "2026-10-01T09:00:00Z" })]);
    expect(e.tipo).toBe("attiva");
    const riga = { stato: "aperto" as const, richiesta_attiva: e.tipo === "attiva" ? e.richiesta : null };
    expect(statoEffettivoAlert(riga)).toBe("richiesta_inserita");
    expect(alertSelezionabile(riga)).toBe(false);
  });
  test("approvata non processata → resta visibile come attiva", () => {
    expect(esitoRichiestaAlert(alert, [ric({ stato: "approvata", stato_export: "esportata" })]).tipo).toBe("attiva");
  });
  const proc = ric({ stato: "approvata", stato_export: "processata", tipo: "rinnovo", importo_richiesto: 3000, data_processata: "2026-10-31T10:00:00Z" });
  test("processata dopo l'apertura e fido Gamma cambiato → riga nascosta", () => {
    expect(esitoRichiestaAlert({ ...alert, fido_gamma_apertura: 3000 }, [proc], 5000).tipo).toBe("processata");
  });
  test("processata ma fido Gamma uguale (rinnovo) → resta visibile con la decisione", () => {
    const e = esitoRichiestaAlert({ ...alert, fido_gamma_apertura: 3000 }, [proc], 3000);
    expect(e.tipo).toBe("decisa");
    if (e.tipo === "decisa") expect(etichettaDecisioneAlert(e.richiesta)).toBe(`Ultima decisione: 31/10, confermato ${formatEuro(3000)}`);
  });
  test("decisione con extra protetto → non selezionabile", () => {
    expect(alertSelezionabile({ stato: "aperto", richiesta_attiva: null, decisione_protetta: true })).toBe(false);
    expect(alertSelezionabile({ stato: "aperto", richiesta_attiva: null, decisione_protetta: false })).toBe(true);
  });
  test("rifiutata → nessuna richiesta, l'alert torna aperto e selezionabile", () => {
    const e = esitoRichiestaAlert(alert, [ric({ stato: "rifiutata" })]);
    expect(e.tipo).toBe("nessuna");
    const riga = { stato: "richiesta_inserita" as const, richiesta_attiva: null };
    expect(statoEffettivoAlert(riga)).toBe("aperto");
    expect(alertSelezionabile(riga)).toBe(true);
  });
  test("extra non usato: la richiesta che l'ha generato non lo nasconde", () => {
    const ex = { tipo: "extra_non_usato" as const, aperto_il: alert.aperto_il, richiesta_id: "r1" };
    expect(esitoRichiestaAlert(ex, [ric({ stato: "approvata", stato_export: "processata", data_processata: "2026-10-31T10:00:00Z" })]).tipo).toBe("nessuna");
  });
});
