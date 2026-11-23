import { expect, test } from "bun:test";
import { classificaRuoloCerved, etichettaArco, famigliaArco } from "../src/lib/cerved-grafo";

test("tabella ruoli → famiglia ed etichetta breve", () => {
  const casi: [string, string, string][] = [
    ["SOCIO UNICO", "quote", "Socio unico"], ["SOCIO", "quote", "Socio"], ["SOCIO ACCOMANDANTE", "quote", "Accomandante"],
    ["SOCIO ACCOMANDATARIO", "quote", "Accomandatario"], ["SOCIO AMMINISTRATORE", "quote", "Socio amministratore"],
    ["SOCIO DI SOCIETA' IN NOME COLLETTIVO", "quote", "Socio"], ["SOCIO LAVORANTE", "quote", "Socio"],
    ["SOCIO CHE NON PARTECIPA ALLE LAVORAZIONI", "quote", "Socio"], ["TITOLARE FIRMATARIO", "quote", "Titolare"],
    ["AMMINISTRATORE UNICO", "cariche", "Amministratore"], ["AMMINISTRATORE", "cariche", "Amministratore"],
    ["AMMINISTRATORE DELEGATO", "cariche", "Amm. delegato"], ["CONSIGLIERE", "cariche", "Consigliere"],
    ["CONSIGLIERE DELEGATO", "cariche", "Consigliere"], ["PRESIDENTE CONSIGLIO AMMINISTRAZIONE", "cariche", "Presidente CdA"],
    ["VICE PRESIDENTE CONSIGLIO AMMINISTRAZIONE", "cariche", "Vicepresidente"], ["VICE PRESIDENTE", "cariche", "Vicepresidente"],
    ["LIQUIDATORE", "cariche", "Liquidatore"], ["LEGALE RAPPRESENTANTE", "cariche", "Legale rappr."],
    ["MEMBRO CONSIGLIO DIRETTIVO", "cariche", "Membro direttivo"], ["MEMBRO COMITATO DIRETTIVO", "cariche", "Membro direttivo"],
    ["SINDACO EFFETTIVO", "altri", "Sindaco"], ["SINDACO SUPPLENTE", "altri", "Sindaco"], ["PRESIDENTE DEL COLLEGIO SINDACALE", "altri", "Sindaco"],
    ["REVISORE LEGALE", "altri", "Revisore"], ["REVISORE UNICO", "altri", "Revisore"], ["REVISORE DEI CONTI", "altri", "Revisore"],
    ["PROCURATORE", "altri", "Procuratore"], ["PROCURATORE SPECIALE", "altri", "Procuratore"],
    ["RESPONSABILE TECNICO", "altri", "Resp. tecnico"], ["DIRETTORE TECNICO", "altri", "Dir. tecnico"],
    ["PREPOSTO ALLA GESTIONE TECNICA", "altri", "Preposto"], ["INSTITORE", "altri", "Direttore"],
    ["CURATORE SPECIALE DELLA PROCEDURA", "altri", "Curatore speciale…"],
  ];
  for (const [r, f, b] of casi) expect([r, classificaRuoloCerved(r)]).toEqual([r, { famiglia: f, breve: b }]);
});

test("GIO' IMMOBILIARE: Socio unico · Amministratore; titolare effettivo solo senza quote; +N", () => {
  const leg = (...r: string[]) => ({ legami: r.map(classificaRuoloCerved) });
  expect(etichettaArco(leg("SOCIO UNICO", "AMMINISTRATORE UNICO"))).toBe("Socio unico · Amministratore");
  expect(famigliaArco(leg("SINDACO EFFETTIVO", "CONSIGLIERE"))).toBe("cariche");
  expect(etichettaArco({ legami: [{ famiglia: "quote", breve: "Titolare effettivo", titolare: true }, { famiglia: "cariche", breve: "Amministratore" }] })).toBe("Titolare effettivo · Amministratore");
  expect(etichettaArco(leg("CONSIGLIERE", "PROCURATORE", "SINDACO", "LIQUIDATORE"))).toBe("Consigliere · Liquidatore +2");
});
