import { describe, expect, test } from "bun:test";
import { leggiEmailAllegato } from "../src/lib/email-allegato";

type FieldsData = {
  dataType: "msg"; senderName?: string; senderEmail?: string; senderSmtpAddress?: string;
  lastModifierName?: string; body?: string;
  recipients?: { recipType: "to" | "cc"; name?: string; email?: string; smtpAddress?: string }[];
  attachments?: { fileName: string; attachmentHidden?: boolean; pidContentId?: string; attachMimeTag?: string }[];
};

async function conEmailSintetica(dati: FieldsData, verifica: (email: Awaited<ReturnType<typeof leggiEmailAllegato>>) => void) {
  const CFB = await import("cfb");
  const cfb = CFB.utils.cfb_new();
  const root = "Root Entry/";
  function stringa(cartella: string, tag: string, valore?: string) {
    if (valore === undefined) return;
    const u = new Uint8Array((valore.length + 1) * 2), dv = new DataView(u.buffer);
    for (let i = 0; i < valore.length; i++) dv.setUint16(i * 2, valore.charCodeAt(i), true);
    CFB.utils.cfb_add(cfb, `${cartella}__substg1.0_${tag}001F`, u);
  }
  function proprieta(cartella: string, header: number, id: number, tipo: number, valore: number) {
    const u = new Uint8Array(header + 16), dv = new DataView(u.buffer);
    dv.setUint16(header, tipo, true); dv.setUint16(header + 2, id, true);
    dv.setUint32(header + 8, valore, true);
    CFB.utils.cfb_add(cfb, `${cartella}__properties_version1.0`, u);
  }
  CFB.utils.cfb_add(cfb, `${root}__properties_version1.0`, new Uint8Array(32));
  for (const [tag, valore] of [["0C1A", dati.senderName], ["0C1F", dati.senderEmail], ["5D01", dati.senderSmtpAddress], ["3FFA", dati.lastModifierName], ["1000", dati.body]]) {
    if (tag) stringa(root, tag, valore);
  }
  dati.recipients?.forEach((r, i) => {
    const c = `${root}__recip_version1.0_#${i.toString(16).toUpperCase().padStart(8, "0")}/`;
    proprieta(c, 8, 0x0C15, 0x0003, r.recipType === "cc" ? 2 : 1);
    stringa(c, "3001", r.name); stringa(c, "3003", r.email); stringa(c, "39FE", r.smtpAddress);
  });
  dati.attachments?.forEach((a, i) => {
    const c = `${root}__attach_version1.0_#${i.toString(16).toUpperCase().padStart(8, "0")}/`;
    proprieta(c, 8, 0x7FFE, 0x000B, a.attachmentHidden ? 1 : 0);
    stringa(c, "3707", a.fileName); stringa(c, "370E", a.attachMimeTag); stringa(c, "3712", a.pidContentId);
    CFB.utils.cfb_add(cfb, `${c}__substg1.0_37010102`, new Uint8Array([37, 80, 68, 70, 45]));
  });
  const byte = Uint8Array.from(CFB.write(cfb, { type: "array" }));
  verifica(await leggiEmailAllegato(byte.buffer, "sintetica.msg"));
}

describe("Lettore unico email allegate", () => {
  test("Legge la fixture MSG senza Buffer globale anche al primo import di CFB", async () => {
    // Processo fresco: has_buf viene inizializzato senza Buffer, non dal cache di altri test.
    const lettore = new URL("../src/lib/email-allegato.ts", import.meta.url).href;
    const fixture = new URL("./fixtures/email/prova.msg", import.meta.url).href;
    const processo = Bun.spawn([process.execPath, "--eval", `
      const originale = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
      try {
        delete globalThis.Buffer;
        const { leggiEmailAllegato } = await import(${JSON.stringify(lettore)});
        const email = await leggiEmailAllegato(await Bun.file(new URL(${JSON.stringify(fixture)})).arrayBuffer(), "prova.msg");
        console.log(JSON.stringify({ buffer: typeof globalThis.Buffer, oggetto: email.oggetto, allegati: email.allegati.length }));
      } finally {
        if (originale) Object.defineProperty(globalThis, "Buffer", originale);
      }
    `], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(processo.stdout).text();
    const errore = await new Response(processo.stderr).text();
    expect(errore).toBe("");
    expect(await processo.exited).toBe(0);
    expect(JSON.parse(output)).toEqual({ buffer: "undefined", oggetto: "Pratica di prova - documento allegato", allegati: 1 });
  });
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
  test("Esclude gli allegati nascosti della firma tramite la proprietà 0x7FFE", async () => {
    await conEmailSintetica({ dataType: "msg", body: "Prima riga\nSeconda riga", attachments: [
      { fileName: "firma.png", attachmentHidden: true, pidContentId: "firma", attachMimeTag: "image/png" },
      { fileName: "documento.pdf", attachmentHidden: false, attachMimeTag: "application/pdf" },
      { fileName: "immagine-visibile.png", pidContentId: "visibile", attachMimeTag: "image/png" },
    ] }, (email) => {
      expect(email.allegati.map((a) => a.nome)).toEqual(["documento.pdf", "immagine-visibile.png"]);
      expect(email.corpoTesto).toBe("Prima riga\nSeconda riga");
      expect(email.nascosti).toBe(1);
    });
  });
});