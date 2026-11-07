import { describe, expect, test } from "bun:test";
import { leggiEmailAllegato } from "../src/lib/email-allegato";

describe("Lettore unico email allegate", () => {
  for (const nome of ["prova.msg", "prova.eml"]) {
    test(`Legge oggetto, mittente, corpo e PDF da ${nome}`, async () => {
      const email = await leggiEmailAllegato(await Bun.file(new URL(`./fixtures/email/${nome}`, import.meta.url)).arrayBuffer(), nome);
      expect(email.oggetto).toBe("Pratica di prova - documento allegato");
      expect(email.mittente).toBe("Ufficio di prova <ufficio@example.test>");
      expect(email.destinatari.a).toEqual(["Studio di prova <legale@example.test>"]);
      expect(email.destinatari.cc).toEqual(["Amministrazione <copia@example.test>"]);
      expect(email.corpoTesto).toContain("in allegato il documento per la pratica di prova");
      expect(email.corpoHtml).toContain("Conferma ricezione pratica");
      expect(Date.parse(email.data || "")).toBe(Date.parse("2026-11-07T09:30:00Z"));
      expect(email.allegati).toHaveLength(1);
      expect(email.allegati[0]?.nome).toBe("documento.pdf");
      expect(email.allegati[0]?.mime).toBe("application/pdf");
      expect(new TextDecoder().decode(email.allegati[0]?.byte.slice(0, 5))).toBe("%PDF-");
    });
  }
  test("Rifiuta MSG non valido", async () => {
    await expect(leggiEmailAllegato(new ArrayBuffer(32), "rotto.msg")).rejects.toThrow();
  });
  test("Riconosce EML dal MIME anche senza estensione", async () => {
    const email = await leggiEmailAllegato(await Bun.file(new URL("./fixtures/email/prova.eml", import.meta.url)).arrayBuffer(), "email", "message/rfc822");
    expect(email.allegati).toHaveLength(1);
  });
});