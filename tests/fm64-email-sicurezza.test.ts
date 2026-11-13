import { describe, expect, test } from "bun:test";
import { mascheraEmail, mascheraEmailNelLog } from "../src/lib/email-log";
import { verificaTipoAllegatoInvio } from "../src/lib/allegati-invio-sicuri";
import { renderTemplate } from "../src/lib/template-email-render";
import { buildEmailCampagna } from "../src/lib/campagna-marketing-email";

test("il log mostra solo iniziale e dominio", () => {
  expect(mascheraEmail("mario.rossi@made.it")).toBe("m***@made.it");
  expect(mascheraEmailNelLog(new Error("SMTP rifiuta mario.rossi@made.it e anna@made.it"))).toBe("SMTP rifiuta m***@made.it e a***@made.it");
});

describe("tipi allegati fornitori: estensione e MIME", () => {
  for (const [ext, mime] of Object.entries({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" })) {
    test(`ammette ${ext} con MIME corretto`, () => {
      expect(() => verificaTipoAllegatoInvio(`file.${ext}`, mime)).not.toThrow();
      expect(() => verificaTipoAllegatoInvio(`file.${ext}`, "text/html")).toThrow("Tipo di file non ammesso");
    });
  }
  test("rifiuta HTML, SVG, eseguibili e MIME mancante/generico", () => {
    for (const [nome, mime] of [["file.html", "text/html"], ["file.svg", "image/svg+xml"], ["file.exe", "application/pdf"], ["file.pdf", ""], ["file.pdf", "application/octet-stream"]]) {
      expect(() => verificaTipoAllegatoInvio(nome, mime)).toThrow();
    }
  });
});

test("oggetto sollecito letterale, corpo HTML con escape", () => {
  const r = renderTemplate({ oggetto: "Sollecito {{ragione_sociale}}", corpo: "<p>{{ragione_sociale}} / {{nome_operatore}}</p>" }, { ragione_sociale: "B&B <Srl>", nome_operatore: "Mario & Anna", scadenze: [] });
  expect(r.oggetto).toBe("Sollecito B&B <Srl>");
  expect(r.corpo).toBe("<p>B&amp;B &lt;Srl&gt; / Mario &amp; Anna</p>");
});

test("le campagne riusano oggetto letterale e corpo escaped del motore", () => {
  const r = buildEmailCampagna({ oggetto: "{{ragione_sociale}} {{citta}} {{nome_operatore}}", corpo: "<p>{{ragione_sociale}} {{citta}}</p>", dati: { ragione_sociale: "B&B <Srl>", citta: "A&B", agente: "", categoria: "" }, mittente: { nome: "Mario & Anna" }, linkRecesso: null, useCid: false });
  expect(r.oggetto).toBe("B&B <Srl> A&B Mario & Anna");
  expect(r.html).toContain("<p>B&amp;B &lt;Srl&gt; A&amp;B</p>");
});