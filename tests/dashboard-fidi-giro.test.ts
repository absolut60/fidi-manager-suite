import { describe, expect, test } from "bun:test";
import { riepilogoPosConFido, riepilogoPrivati, isPrivatoCard } from "../src/lib/dashboard-fidi-giro";
import { isPrivatoFido } from "../src/lib/fido-teorico";

const SEDE = "b07c4c61-12e4-4a87-8e79-bbb9c181ffe9";

describe("card Privati (senza partita IVA)", () => {
  const clienti = [
    { partita_iva: null, store_id: "s1", fido_gestionale: 5000, totale_rischio: 1200, fido_proposto: 4000 },
    { partita_iva: "  ", store_id: "s1", fido_gestionale: 0, totale_rischio: 300, fido_proposto: 500 },
    { partita_iva: "", store_id: "s1", fido_gestionale: 1000, totale_rischio: -50, fido_proposto: 0 },
    { partita_iva: "01234567890", store_id: SEDE, fido_gestionale: 9000, totale_rischio: 900, fido_proposto: 9000 },
    { partita_iva: null, store_id: SEDE, fido_gestionale: 7000, totale_rischio: 700, fido_proposto: 7000 },
    { partita_iva: "01234567890", store_id: "s1", fido_gestionale: 20000, totale_rischio: 100, fido_proposto: 1 },
  ];

  test("conta solo i senza partita IVA con fido, Sede Centrale esclusa", () => {
    const r = riepilogoPrivati(clienti);
    expect(r.conFidoN).toBe(2);
    expect(r.concesso).toBe(6000);
    // proposto ed esposizione positiva su tutti i privati (anche senza fido)
    expect(r.proposto).toBe(4500);
    expect(r.esposizione).toBe(1500);
  });

  test("Sede Centrale resta fuori dal giro fidi ma non è un privato della card", () => {
    expect(isPrivatoFido(clienti[3])).toBe(true);
    expect(isPrivatoCard(clienti[3])).toBe(false);
    expect(isPrivatoCard(clienti[4])).toBe(false);
  });
});

describe("card POS / contanti con fido", () => {
  test("conta pagamento_immediato con fido > 0", () => {
    const r = riepilogoPosConFido([
      { regola_applicata: "pagamento_immediato", fido_gestionale: 5000 },
      { regola_applicata: "pagamento_immediato", fido_gestionale: 5000 },
      { regola_applicata: "pagamento_immediato", fido_gestionale: 1000 },
      { regola_applicata: "pagamento_immediato", fido_gestionale: 0 },
      { regola_applicata: "standard", fido_gestionale: 8000 },
    ]);
    expect(r).toEqual({ n: 3, concesso: 11000 });
  });

  test("nessun cliente → zero", () => {
    expect(riepilogoPosConFido([])).toEqual({ n: 0, concesso: 0 });
  });
});
