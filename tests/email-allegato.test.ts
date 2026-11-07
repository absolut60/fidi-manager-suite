import { describe, expect, spyOn, test } from "bun:test";
import type { FieldsData } from "@kenjiuno/msgreader";
import { leggiEmailAllegato } from "../src/lib/email-allegato";

async function conEmailSintetica(dati: FieldsData, verifica: (email: Awaited<ReturnType<typeof leggiEmailAllegato>>) => void) {
  const modulo = await import("@kenjiuno/msgreader");
  const esportato = modulo.default;
  const MsgReader = typeof esportato === "function" ? esportato : (esportato as unknown as { default: typeof modulo.default }).default;
  const lettura = spyOn(MsgReader.prototype, "getFileData").mockReturnValue(dati);
  const allegato = spyOn(MsgReader.prototype, "getAttachment").mockImplementation((a) => {
    if (typeof a === "number") throw new Error("Atteso allegato sintetico");
    if (a.attachmentHidden) throw new Error("Un allegato nascosto non deve essere letto");
    return { fileName: a.fileName || "documento.pdf", content: new Uint8Array([37, 80, 68, 70, 45]) };
  });
  try {
    verifica(await leggiEmailAllegato(new ArrayBuffer(32), "sintetica.msg"));
  } finally {
    lettura.mockRestore(); allegato.mockRestore();
  }
}

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
  test("Mittente X500 senza indirizzo pubblico mostra solo il nome", async () => {
    await conEmailSintetica({ dataType: "msg", senderName: "Operatore di prova", senderEmail: "/o=EXCHANGELABS/OU=PROVA/CN=UTENTE", lastModifierName: "Operatore" }, (email) => {
      expect(email.mittente).toBe("Operatore di prova");
    });
  });
  test("Mittente X500 usa lastModifierName se contiene un indirizzo email", async () => {
    await conEmailSintetica({ dataType: "msg", senderName: "Operatore di prova", senderEmail: "/O=EXCHANGELABS/OU=PROVA/CN=UTENTE", lastModifierName: "operatore@example.test" }, (email) => {
      expect(email.mittente).toBe("Operatore di prova <operatore@example.test>");
    });
  });
  test("SMTP del mittente ha precedenza sull'indirizzo Exchange e sul modificatore", async () => {
    await conEmailSintetica({ dataType: "msg", senderName: "Operatore", senderEmail: "/O=PROVA", senderSmtpAddress: "smtp@example.test", lastModifierName: "altro@example.test" }, (email) => {
      expect(email.mittente).toBe("Operatore <smtp@example.test>");
    });
  });
  test("Destinatari usano SMTP e non mostrano mai indirizzi X500", async () => {
    await conEmailSintetica({ dataType: "msg", recipients: [
      { recipType: "to", name: "Studio", email: "/O=PROVA", smtpAddress: "studio@example.test" },
      { recipType: "cc", name: "Collega", email: "/o=PROVA" },
    ] }, (email) => {
      expect(email.destinatari.a).toEqual(["Studio <studio@example.test>"]);
      expect(email.destinatari.cc).toEqual(["Collega"]);
    });
  });
  test("Esclude gli allegati nascosti della firma senza leggerne i byte", async () => {
    await conEmailSintetica({ dataType: "msg", body: "Prima riga\nSeconda riga", attachments: [
      { fileName: "firma.png", attachmentHidden: true, pidContentId: "firma", attachMimeTag: "image/png" },
      { fileName: "documento.pdf", attachmentHidden: false, attachMimeTag: "application/pdf" },
      { fileName: "immagine-visibile.png", pidContentId: "visibile", attachMimeTag: "image/png" },
    ] }, (email) => {
      expect(email.allegati.map((a) => a.nome)).toEqual(["documento.pdf", "immagine-visibile.png"]);
      expect(email.corpoTesto).toBe("Prima riga\nSeconda riga");
    });
  });
});