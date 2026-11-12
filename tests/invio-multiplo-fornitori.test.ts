// FM62 G5: invio a più fornitori — destinatari, anti-doppione per fornitore,
// segnaposto, limiti e stato finale.
import { describe, expect, test } from "bun:test";
import {
  pianificaInvioFornitori, righeDaSpedire, applicaSegnapostoFornitore, applicaSegnapostoTesto,
  statoFinaleInvio, messaggioFineInvio, avviaInvioFornitoriInput, lettereFornitoriInput, MAX_FORNITORI_INVIO, MAX_FORNITORI_LETTERE,
} from "@/lib/invio-multiplo-fornitori";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("destinatari", () => {
  test("una sola email per fornitore, senza email valida = saltato", () => {
    const r = pianificaInvioFornitori([
      { id: "a", email: " ordini@knauf.it " }, { id: "a", email: "ordini@knauf.it" },
      { id: "b", email: null }, { id: "c", email: "a@x.it; b@y.it" }, { id: "d", email: "info@siniat.it" },
    ]);
    expect(r.destinatari.map(d => [d.id, d.email])).toEqual([["a", "ordini@knauf.it"], ["d", "info@siniat.it"]]);
    expect(r.saltati.map(s => s.id)).toEqual(["b", "c"]);
  });
});

describe("anti-doppione per fornitore", () => {
  test("un retry spedisce solo le righe ancora in invio", () => {
    const righe = [{ id: "1", stato: "inviata" }, { id: "2", stato: "in_invio" }, { id: "3", stato: "errore" }, { id: "4", stato: "in_invio" }];
    expect(righeDaSpedire(righe).map(r => r.id)).toEqual(["2", "4"]);
    expect(righeDaSpedire(righeDaSpedire(righe).map(r => ({ ...r, stato: "inviata" })))).toEqual([]);
  });
  test("fornitori ripetuti nella selezione contano una volta", () => {
    const d = avviaInvioFornitoriInput.parse({ chiaveInvio: uuid(1), fornitoriIds: [uuid(2), uuid(2), uuid(3)], oggetto: "Listino", html: "<p>Ciao</p>", nuoviAllegati: [] });
    expect(d.fornitoriIds).toEqual([uuid(2), uuid(3)]);
  });
});

describe("limiti", () => {
  test(`massimo ${MAX_FORNITORI_INVIO} fornitori per invio`, () => {
    const base = { chiaveInvio: uuid(1), oggetto: "x", html: "<p>x</p>", nuoviAllegati: [] };
    expect(avviaInvioFornitoriInput.safeParse({ ...base, fornitoriIds: Array.from({ length: 500 }, (_, i) => uuid(i + 10)) }).success).toBe(true);
    expect(avviaInvioFornitoriInput.safeParse({ ...base, fornitoriIds: Array.from({ length: 501 }, (_, i) => uuid(i + 10)) }).success).toBe(false);
  });
  test(`massimo ${MAX_FORNITORI_LETTERE} lettere per volta`, () => {
    const base = { oggetto: "x", html: "<p>x</p>" };
    expect(lettereFornitoriInput.safeParse({ ...base, fornitoriIds: Array.from({ length: 200 }, (_, i) => uuid(i + 10)) }).success).toBe(true);
    expect(lettereFornitoriInput.safeParse({ ...base, fornitoriIds: Array.from({ length: 201 }, (_, i) => uuid(i + 10)) }).success).toBe(false);
  });
  test("il corpo viene sanificato anche nell'invio multiplo", () => {
    const d = avviaInvioFornitoriInput.parse({ chiaveInvio: uuid(1), fornitoriIds: [uuid(2)], oggetto: "x", html: '<p onclick="x()">Ciao<script>alert(1)</script></p>', nuoviAllegati: [] });
    expect(d.html.html).toBe("<p>Ciao</p>");
  });
});

describe("segnaposto e stato", () => {
  test("{{ragione_sociale}} con escape HTML", () => {
    expect(applicaSegnapostoFornitore("<p>Spett. {{ ragione_sociale }}</p>", "Rossi & <Figli>")).toBe("<p>Spett. Rossi &amp; &lt;Figli&gt;</p>");
    expect(applicaSegnapostoTesto("Gentile {{ragione_sociale}}", null)).toBe("Gentile Fornitore");
  });
  test("stato finale", () => {
    expect(statoFinaleInvio({ totale: 3, inviati: 2, errori: 0 })).toBe("in_corso");
    expect(statoFinaleInvio({ totale: 3, inviati: 3, errori: 0 })).toBe("completato");
    expect(statoFinaleInvio({ totale: 3, inviati: 2, errori: 1 })).toBe("con_errori");
    expect(messaggioFineInvio({ inviati: 2, errori: 1, saltati: 4 }, "Listino").messaggio).toBe('"Listino": 2 inviate, 1 non riuscita, 4 fornitori senza email.');
  });
});
