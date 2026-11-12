// FM62 G4: il motore lettera condiviso non cambia il PDF dei clienti; il corpo
// formattato dei fornitori diventa blocchi (grassetto, elenchi, allineamento).
import { describe, expect, test, setSystemTime, afterAll } from "bun:test";
import { costruisciLetteraPdf } from "@/lib/lettera-pdf.server";
import { costruisciLetteraPdf as primaFm62 } from "./fixtures/lettera-pdf-prima.server";
import { htmlInBlocchiLettera } from "@/lib/lettera-blocchi";
import { creaDocumentoLettera, disegnaLettera } from "@/lib/lettera-pdf.server";
import { SEDE_FALLBACK } from "@/lib/template-email-render";

function finto(dati: Record<string, unknown>) {
  const catena = (tabella: string): any => {
    const valore = dati[tabella];
    const q: any = new Proxy({}, { get: (_t, k) => {
      if (k === "maybeSingle" || k === "single") return async () => ({ data: Array.isArray(valore) ? valore[0] : valore ?? null, error: null });
      if (k === "then") return (res: (v: unknown) => void) => res({ data: Array.isArray(valore) ? valore : valore ? [valore] : [], error: null });
      return () => q;
    } });
    return q;
  };
  return { from: (t: string) => catena(t) } as any;
}
const sb = finto({
  clienti: { id: "c1", ragione_sociale: "EDILROSSI SRL", indirizzo: "Via Roma 1", cap: "20010", citta: "Casorezzo", provincia: "MI", store_id: "s1" },
  stores: { nome: "CASOREZZO", insegna: "MADE | GARAVAGLIA", indirizzo: "Via Milano 2", cap: "20003", citta: "Casorezzo", provincia: "MI", telefono: "02 1", email_sede: "a@b.it", pec_sede: null, ragione_sociale_sede: null },
  scadenze: [{ numero_documento: "F1", data_documento: "2026-01-10", data_scadenza: "2026-02-10", importo_scadenza: 1200.5, codice_pagamento: "RB60", stato_contabile: "Aperta", giorni_ritardo: 200, tempi_scadenza: "Scaduto", data_pagamento_effettiva: null }],
  profili: { nome: "Andrea", cognome: "Giani" },
  configurazioni: { valore: "3" },
});

describe("lettera clienti identica dopo FM62 G4", () => {
  setSystemTime(new Date("2026-11-12T10:00:00Z"));
  afterAll(() => setSystemTime());
  for (const caso of [
    { nome: "libera", input: { clienteId: "c1", oggettoOverride: "Oggetto: Sollecito", corpoOverride: "Spett.le EDILROSSI SRL\nGentile cliente,\nvi scriviamo.\n\nCordiali saluti\nAndrea" } },
    { nome: "con tabella", input: { clienteId: "c1", oggettoOverride: "Avviso", corpoOverride: "Riga lunga ".repeat(80) } },
  ]) test(caso.nome, async () => {
    const dopo = await costruisciLetteraPdf(sb, "u1", caso.input);
    const prima = await primaFm62(sb, "u1", caso.input);
    expect(dopo.fileName).toBe(prima.fileName);
    expect(Buffer.from(dopo.pdfBytes).equals(Buffer.from(prima.pdfBytes))).toBe(true);
  });
});

describe("corpo formattato del fornitore", () => {
  test("grassetto, corsivo, sottolineato, elenchi e allineamento", () => {
    const b = htmlInBlocchiLettera('<p>Ciao <b>forte</b> <i>obl</i> <u>sott</u></p><ul><li>uno</li><li>due</li></ul><ol><li>a</li><li>b</li></ol><p style="text-align:center">centro</p>');
    expect(b[0].runs.find(r => r.t === "forte")?.b).toBe(true);
    expect(b[0].runs.find(r => r.t === "obl")?.i).toBe(true);
    expect(b[0].runs.find(r => r.t === "sott")?.u).toBe(true);
    expect(b.filter(x => x.elenco).map(x => x.elenco)).toEqual(["•", "•", "1.", "2."]);
    expect(b[b.length - 1].allineamento).toBe("center");
  });
  test("a capo e righe vuote", () => {
    const b = htmlInBlocchiLettera("<div>riga1<br>riga2</div><div><br></div><div>dopo</div>");
    expect(b[0].runs.map(r => r.t).join("")).toBe("riga1\nriga2");
    expect(b[b.length - 1].runs[0].t).toBe("dopo");
  });
  test("il PDF del fornitore si genera, anche su più pagine", async () => {
    const ctx = await creaDocumentoLettera();
    for (let i = 0; i < 2; i++) await disegnaLettera(ctx, {
      destinatario: { ragione_sociale: "KNAUF ITALIA SAS", indirizzo: "Via Livornese 20", cap: "56040", citta: "Castellina M.ma", provincia: "PI" },
      sede: SEDE_FALLBACK, sedeExtra: { email: null, pec: null, ragSociale: null }, oggetto: "Listino 2027",
      corpo: htmlInBlocchiLettera("<p><b>Gentili</b> signori,</p>" + "<p>testo lungo ".repeat(120) + "</p>"), scadute: [], speseUnit: 0, nomeOperatore: "Andrea Giani",
    });
    expect(ctx.pdfDoc.getPageCount()).toBeGreaterThanOrEqual(4);
  });
});
