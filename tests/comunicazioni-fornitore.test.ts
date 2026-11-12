import { describe, it, expect } from "bun:test";
import { inviaEmailFornitoreInput, eseguiInvioFornitore, corpoAttivitaInvio, testoInHtml, sanificaHtmlEmailFornitore as san, htmlInTesto } from "@/lib/comunicazioni-fornitore";
import { buildPiedeRiservatezzaHtml, TESTO_RISERVATEZZA_EMAIL_FORNITORE } from "@/lib/email-piede-riservatezza";
import { wrapEmailHtml, SEDE_FALLBACK } from "@/lib/template-email-render";

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const id = "00000000-0000-4000-8000-000000000001";
const base = { fornitoreId: id, chiaveInvio: id, a: ["a@made.it"], cc: [], ccn: [], oggetto: "Ordine", html: "<p>Ciao</p>", allegatiIds: [], nuoviAllegati: [] };
const errori = (d: object) => { const r = inviaEmailFornitoreInput.safeParse({ ...base, ...d }); return r.success ? [] : r.error.issues.map(i => i.message); };

describe("invio email fornitore: validazione", () => {
  it("accetta un invio minimo", () => { expect(errori({})).toEqual([]); });
  it("richiede da 1 a 5 destinatari A", () => {
    expect(errori({ a: [] }).length).toBeGreaterThan(0);
    expect(errori({ a: ["1@m.it", "2@m.it", "3@m.it", "4@m.it", "5@m.it", "6@m.it"] }).join()).toContain("Massimo 5");
  });
  it("massimo 10 indirizzi totali", () => {
    expect(errori({ a: ["1@m.it"], cc: Array.from({ length: 10 }, (_, i) => `c${i}@m.it`) }).join()).toContain("Massimo 10");
  });
  it("rifiuta indirizzi non validi e doppioni anche tra campi", () => {
    expect(errori({ cc: ["non-valido"] }).join()).toContain("non valido");
    expect(errori({ ccn: ["A@made.it"] }).join()).toContain("ripetuto");
  });
  it("oggetto 1..200 e testo 1..20000", () => {
    expect(errori({ oggetto: "  " }).length).toBeGreaterThan(0);
    expect(errori({ oggetto: "x".repeat(201) }).length).toBeGreaterThan(0);
    expect(errori({ html: "x".repeat(20001) }).length).toBeGreaterThan(0);
    expect(errori({ html: "x".repeat(20000) })).toEqual([]);
  });
  it("chiave di invio obbligatoria e uuid", () => { expect(errori({ chiaveInvio: "abc" }).length).toBeGreaterThan(0); });
});

describe("invio email fornitore: sequenza e anti-doppione", () => {
  it("chiave già usata: nessun reinvio, esito della riga esistente", async () => {
    let inviate = 0;
    const r = await eseguiInvioFornitore({
      inserisci: async () => ({ duplicato: true }), leggiEsistente: async () => ({ id: "x", stato: "inviata", errore: null }),
      invia: async () => { inviate++; return { ok: true }; }, aggiorna: async () => {},
    });
    expect(inviate).toBe(0);
    expect(r).toMatchObject({ attivitaId: "x", stato: "inviata", giaInviata: true });
  });
  it("registra prima la riga, poi invia, poi salva l'esito", async () => {
    const passi: string[] = [];
    const r = await eseguiInvioFornitore({
      inserisci: async () => { passi.push("ins"); return { id: "n" }; }, leggiEsistente: async () => null,
      invia: async () => { passi.push("invio"); return { ok: true, messageId: "<m1>" }; },
      aggiorna: async (_i, v) => { passi.push(`agg:${v.stato}:${v.message_id}`); },
    });
    expect(passi).toEqual(["ins", "invio", "agg:inviata:<m1>"]);
    expect(r.stato).toBe("inviata");
  });
  it("se la riga non si scrive l'email non parte", async () => {
    let inviate = 0;
    await expect(eseguiInvioFornitore({
      inserisci: async () => { throw new Error("no"); }, leggiEsistente: async () => null,
      invia: async () => { inviate++; return { ok: true }; }, aggiorna: async () => {},
    })).rejects.toThrow();
    expect(inviate).toBe(0);
  });
  it("errore di invio salvato come stato errore", async () => {
    let salvato: unknown;
    const r = await eseguiInvioFornitore({
      inserisci: async () => ({ id: "n" }), leggiEsistente: async () => null,
      invia: async () => ({ ok: false, err: "Casella piena" }), aggiorna: async (_i, v) => { salvato = v; },
    });
    expect(salvato).toEqual({ stato: "errore", message_id: null, errore: "Casella piena" });
    expect(r.stato).toBe("errore");
  });
});

describe("piè di pagina riservatezza", () => {
  it("email ai clienti identiche a prima di FM62 G3", () => {
    expect(sha(buildPiedeRiservatezzaHtml())).toBe("d67a6ef4ec03614c9dc44bd8577f6c435717cd70166add015d14576ca29accf5");
    expect(sha(buildPiedeRiservatezzaHtml("cliente"))).toBe("d67a6ef4ec03614c9dc44bd8577f6c435717cd70166add015d14576ca29accf5");
    expect(sha(wrapEmailHtml("<p>x</p>", SEDE_FALLBACK, { nome: "A", email: "a@b.it" }, { senzaBande: true, piedeRiservatezza: true, useCid: true })))
      .toBe("b3cc5e745f584cad390dd338d6fbc252886f090db50cebc3b2810629c9ce8601");
  });
  it("fornitori: testo neutro, riciclo e ambiente invariati", () => {
    const h = buildPiedeRiservatezzaHtml("fornitore");
    expect(h).not.toContain("rapporto con il cliente");
    expect(h).toContain("rapporto commerciale con MADE Distribuzione");
    expect(h).toContain("&#9851;");
    expect(h).toContain("considera l&#39;impatto sull&#39;ambiente.");
    expect(TESTO_RISERVATEZZA_EMAIL_FORNITORE).not.toContain("cliente");
  });
});

describe("corpo e testo", () => {
  it("a capo rispettati e HTML neutralizzato", () => { expect(testoInHtml("a<b>\nc")).toContain("a&lt;b&gt;<br/>c"); });
  it("elenca gli allegati presi dalla scheda", () => { expect(corpoAttivitaInvio("T", ["a.pdf", "b.pdf"])).toBe("T\n\n— Allegati dalla scheda fornitore: a.pdf, b.pdf"); });
});

describe("sanificazione HTML fornitore", () => {
  it("elimina script, style, iframe e img col contenuto", () => {
    expect(san('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><img src="http://x/y.png" onerror="z">b')).toBe("<p>a</p>b");
  });
  it("toglie gli attributi on* e i tag sconosciuti mantenendo il testo", () => {
    expect(san('<p onclick="x()" class="Mso">ciao <o:p>Word</o:p><table><tr><td>t</td></tr></table></p>')).toBe("<p>ciao Wordt</p>");
  });
  it("link: solo http, https, mailto", () => {
    expect(san('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(san('<a href="jav&#x09;ascript&colon;alert(1)">x</a>')).toBe("<a>x</a>");
    expect(san('<a href=" JaVaScRiPt:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(san('<a href="data:text/html,x">x</a>')).toBe("<a>x</a>");
    expect(san('<a href="https://made.it/?a=1&b=2">x</a>')).toBe('<a href="https://made.it/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>');
    expect(san('<a href="mailto:a@made.it">m</a>')).toContain('href="mailto:a@made.it"');
  });
  it("stili ammessi tenuti, gli altri scartati", () => {
    expect(san('<span style="font-family: Arial; font-size: 14px; color: #c00; text-align: center; background: red; position:fixed">x</span>'))
      .toBe('<span style="font-family:Arial;font-size:14px;color:#c00;text-align:center">x</span>');
    expect(san('<span style="color: expression(alert(1)); font-size: url(x)">x</span>')).toBe("<span>x</span>");
    expect(san('<span style="color: rgb(10, 20, 30)">x</span>')).toBe('<span style="color:rgb(10, 20, 30)">x</span>');
    expect(san('<font face="Georgia" size="5" color="red" onmouseover="x">x</font>')).toBe('<font face="Georgia" size="5" color="red">x</font>');
  });
  it("chiude i tag aperti e ignora quelli chiusi a vuoto", () => {
    expect(san("<b>a<i>b</b>c</u>")).toBe("<b>a<i>b</i></b>c");
  });
  it("testo con < > e commenti neutralizzati", () => {
    expect(san("a < b <!-- <script>x</script> --> &lt;img&gt;")).toBe("a &lt; b  &lt;img&gt;");
  });
  it("testo semplice per la riga della cronologia", () => {
    expect(htmlInTesto(san("<p>Buongiorno,</p><ul><li>uno</li><li>due</li></ul><p>A&amp;B<br>fine</p>"))).toBe("Buongiorno,\n• uno\n• due\n\nA&B\nfine");
  });
  it("limiti: 20.000 caratteri visibili e 100.000 di HTML", () => {
    const e = (html: string) => { const r = inviaEmailFornitoreInput.safeParse({ ...base, html }); return r.success ? [] : r.error.issues; };
    expect(e("<b>" + "x".repeat(20000) + "</b>")).toEqual([]);
    expect(e("<b>" + "x".repeat(20001) + "</b>").length).toBeGreaterThan(0);
    expect(e("<span>a</span>".repeat(8000)).length).toBeGreaterThan(0);
    expect(e("<script>x</script>").length).toBeGreaterThan(0);
  });
});
